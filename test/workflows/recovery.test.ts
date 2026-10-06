import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const manager = vi.hoisted(() => ({
	createWorktree: vi.fn(async (featureId: string) =>
		path.posix.join("/fake/wt", featureId),
	),
	mergeWorktree: vi.fn(async (_featureId: string) => undefined),
	cleanupWorktree: vi.fn(
		async (_worktreePath: string, _keepOnFailure: boolean) => undefined,
	),
}));

const omp = vi.hoisted(() => ({ runOmp: vi.fn() }));

vi.mock("../../src/worktree/manager.js", () => manager);
vi.mock("../../src/omp/runner.js", () => omp);

import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { HandoffSchema, type Handoff } from "../../src/types/handoff.js";
import { SqliteStepJournal } from "../../src/runtime/step-journal.js";
import {
	generateWorkflowId,
	type WorkflowContext,
} from "../../src/runtime/workflow-runner.js";
import {
	SINGLE_FEATURE_STEPS,
	singleFeatureWorkflow,
} from "../../src/workflows/single-feature.js";

function makeHandoff(featureId: string): Handoff {
	return {
		id: `handoff-${featureId}`,
		featureId,
		salientSummary: `Implemented ${featureId}`,
		whatWasImplemented: ["the feature"],
		whatWasLeftUndone: [],
		verification: { commandsRun: [], interactiveChecks: [] },
		tests: { added: [], coverage: "n/a" },
		discoveredIssues: [],
		skillFeedback: {
			followedProcedure: true,
			deviations: [],
			suggestedChanges: [],
		},
		createdAt: new Date().toISOString(),
	};
}

describe("single-feature workflow crash recovery", () => {
	const input = {
		missionId: "mission-001",
		featureId: "feat-001",
		spec: "Implement feature 001",
	};

	let tmpDir: string;
	let dbPath: string;
	let db: SqliteDb;
	let journal: SqliteStepJournal;

	beforeEach(async () => {
		vi.clearAllMocks();
		omp.runOmp.mockImplementation(
			async (_worktreePath: string, featureId: string) =>
				makeHandoff(featureId),
		);

		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lazyforeman-recovery-"));
		dbPath = path.join(tmpDir, "db.sqlite");
		db = openDatabase(dbPath);
		journal = new SqliteStepJournal(db);
	});

	afterEach(async () => {
		db.close();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	function featureStatus(featureId: string): string | undefined {
		const row = db
			.prepare(`SELECT status FROM features WHERE id = ?`)
			.get(featureId) as { status: string } | undefined;
		return row?.status;
	}

	it("resumes from the journal without re-running a checkpointed step", async () => {
		const workflowId = generateWorkflowId("single-feature", input.featureId);
		let crashed = false;

		const ctx: WorkflowContext = {
			workflowId,
			journal,
			_testHooks: {
				afterStep: (stepName) => {
					if (stepName === "createWorktree" && !crashed) {
						crashed = true;
						throw new Error("SIMULATED_CRASH");
					}
				},
			},
		};

		await expect(singleFeatureWorkflow(ctx, db, input)).rejects.toThrow(
			"SIMULATED_CRASH",
		);

		// createWorktree 已落 checkpoint，崩溃发生在其后
		expect(journal.getStep(workflowId, "createWorktree")?.status).toBe(
			"success",
		);
		expect(manager.createWorktree).toHaveBeenCalledTimes(1);
		expect(manager.mergeWorktree).not.toHaveBeenCalled();

		// 模拟进程重启：关闭句柄后重新打开同一个库文件
		db.close();
		db = openDatabase(dbPath);
		journal = new SqliteStepJournal(db);

		expect(journal.getStep(workflowId, "createWorktree")?.status).toBe(
			"success",
		);

		const resumed = await singleFeatureWorkflow(
			{ workflowId, journal },
			db,
			input,
		);

		expect(resumed.success).toBe(true);
		expect(manager.createWorktree).toHaveBeenCalledTimes(1);
		expect(omp.runOmp).toHaveBeenCalledTimes(1);
		expect(manager.mergeWorktree).toHaveBeenCalledTimes(1);

		for (const step of SINGLE_FEATURE_STEPS) {
			expect(journal.getStep(workflowId, step)?.status, `step ${step}`).toBe(
				"success",
			);
		}

		expect(featureStatus(input.featureId)).toBe("completed");

		const handoffs = db
			.prepare(`SELECT content FROM handoffs WHERE feature_id = ?`)
			.all(input.featureId) as Array<{ content: string }>;
		expect(handoffs).toHaveLength(1);
		expect(() =>
			HandoffSchema.parse(JSON.parse(handoffs[0]?.content ?? "")),
		).not.toThrow();

		const events = db
			.prepare(`SELECT event_type FROM progress_log WHERE mission_id = ?`)
			.all(input.missionId) as Array<{
			event_type: string;
		}>;
		expect(events.map((event) => event.event_type)).toContain(
			"worker_completed",
		);
	});

	it("re-runs a failed step while keeping earlier successful steps checkpointed", async () => {
		const workflowId = generateWorkflowId("single-feature", input.featureId);
		omp.runOmp.mockRejectedValueOnce(new Error("TRANSIENT_OMP_FAILURE"));

		await expect(
			singleFeatureWorkflow({ workflowId, journal }, db, input),
		).rejects.toThrow("TRANSIENT_OMP_FAILURE");

		expect(journal.getStep(workflowId, "createWorktree")?.status).toBe(
			"success",
		);
		expect(journal.getStep(workflowId, "runOmp")?.status).toBe("failed");
		expect(featureStatus(input.featureId)).toBe("failed");

		// 失败路径保留 worktree 供排障
		expect(manager.cleanupWorktree).toHaveBeenCalledTimes(1);
		expect(manager.cleanupWorktree).toHaveBeenCalledWith(
			"/fake/wt/feat-001",
			true,
		);

		db.close();
		db = openDatabase(dbPath);
		journal = new SqliteStepJournal(db);

		const resumed = await singleFeatureWorkflow(
			{ workflowId, journal },
			db,
			input,
		);

		expect(resumed.success).toBe(true);
		expect(manager.createWorktree).toHaveBeenCalledTimes(1);
		expect(omp.runOmp).toHaveBeenCalledTimes(2);
		expect(manager.cleanupWorktree).toHaveBeenLastCalledWith(
			"/fake/wt/feat-001",
			false,
		);
		expect(featureStatus(input.featureId)).toBe("completed");
		expect(journal.getStep(workflowId, "runOmp")?.status).toBe("success");
	});

	it("replays the stored handoff from the journal instead of calling omp again", async () => {
		const workflowId = generateWorkflowId("single-feature", input.featureId);

		await singleFeatureWorkflow({ workflowId, journal }, db, input);
		expect(omp.runOmp).toHaveBeenCalledTimes(1);

		// 全流程已完成后再入一次：所有 step 都命中 checkpoint，一步都不该重跑
		const replayed = await singleFeatureWorkflow(
			{ workflowId, journal },
			db,
			input,
		);

		expect(replayed.success).toBe(true);
		expect(omp.runOmp).toHaveBeenCalledTimes(1);
		expect(manager.createWorktree).toHaveBeenCalledTimes(1);
		expect(manager.cleanupWorktree).toHaveBeenCalledTimes(1);
	});
});
