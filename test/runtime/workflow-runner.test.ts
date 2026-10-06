import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { SqliteStepJournal } from "../../src/runtime/step-journal.js";
import {
	generateWorkflowId,
	runStep,
	type WorkflowContext,
} from "../../src/runtime/workflow-runner.js";

describe("runStep", () => {
	let db: SqliteDb;
	let journal: SqliteStepJournal;
	let ctx: WorkflowContext;

	beforeEach(() => {
		db = openDatabase(":memory:");
		journal = new SqliteStepJournal(db);
		ctx = {
			workflowId: generateWorkflowId("single-feature", "feat-001"),
			journal,
		};
	});

	afterEach(() => {
		db.close();
	});

	it("executes a step once and returns its result", async () => {
		const fn = vi.fn(async () => "worktree-path");

		await expect(runStep(ctx, "createWorktree", fn)).resolves.toBe(
			"worktree-path",
		);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(journal.getStep(ctx.workflowId, "createWorktree")?.status).toBe(
			"success",
		);
	});

	it("replays the stored output instead of re-executing a completed step", async () => {
		const fn = vi.fn(async () => "worktree-path");

		const first = await runStep(ctx, "createWorktree", fn);
		const second = await runStep(ctx, "createWorktree", fn);

		expect(first).toBe("worktree-path");
		expect(second).toBe("worktree-path");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("re-executes a step that previously failed", async () => {
		let calls = 0;
		const flaky = async (): Promise<string> => {
			calls++;
			if (calls === 1) throw new Error("transient");
			return "recovered";
		};

		await expect(runStep(ctx, "runOmp", flaky)).rejects.toThrow("transient");
		expect(journal.getStep(ctx.workflowId, "runOmp")?.status).toBe("failed");

		await expect(runStep(ctx, "runOmp", flaky)).resolves.toBe("recovered");
		expect(calls).toBe(2);
		expect(journal.getStep(ctx.workflowId, "runOmp")?.status).toBe("success");
	});

	it("leaves the success checkpoint intact when afterStep injects a crash", async () => {
		const fn = vi.fn(async () => "worktree-path");
		const crashing: WorkflowContext = {
			...ctx,
			_testHooks: {
				afterStep: (stepName) => {
					if (stepName === "createWorktree") throw new Error("SIMULATED_CRASH");
				},
			},
		};

		await expect(runStep(crashing, "createWorktree", fn)).rejects.toThrow(
			"SIMULATED_CRASH",
		);

		// 崩溃发生在 checkpoint 之后：journal 必须保持 success，resume 才不会再跑一次
		expect(journal.getStep(ctx.workflowId, "createWorktree")?.status).toBe(
			"success",
		);
		await expect(runStep(ctx, "createWorktree", fn)).resolves.toBe(
			"worktree-path",
		);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("does not checkpoint when beforeStep injects a crash", async () => {
		const fn = vi.fn(async () => "worktree-path");
		const crashing: WorkflowContext = {
			...ctx,
			_testHooks: {
				beforeStep: (stepName) => {
					if (stepName === "runOmp") throw new Error("SIMULATED_CRASH");
				},
			},
		};

		await expect(runStep(crashing, "runOmp", fn)).rejects.toThrow(
			"SIMULATED_CRASH",
		);
		expect(fn).not.toHaveBeenCalled();
		expect(journal.getStep(ctx.workflowId, "runOmp")).toBeUndefined();
	});
});
