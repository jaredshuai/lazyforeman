import type { SqliteDb } from "../db/connection.js";
import { HandoffSchema } from "../types/handoff.js";
import { runOmp } from "../omp/runner.js";
import { type WorkflowContext, runStep } from "../runtime/workflow-runner.js";
import {
	cleanupWorktree,
	createWorktree,
	mergeWorktree,
} from "../worktree/manager.js";

/** single-feature workflow 的输入 */
export interface SingleFeatureInput {
	/** 所属 mission；不存在时按 feature 归属自动登记 */
	missionId: string;
	/** feature 标识 */
	featureId: string;
	/** 交给 worker 的需求描述 */
	spec: string;
	/** mission 名称，默认取 missionId */
	missionName?: string;
	/** feature 名称，默认取 featureId */
	featureName?: string;
}

/** single-feature workflow 的成功产出 */
export interface SingleFeatureResult {
	success: true;
	featureId: string;
	handoffId: string;
	worktreePath: string;
}

/** Phase 1 的 step 名，按执行顺序 */
export const SINGLE_FEATURE_STEPS = [
	"registerFeature",
	"createWorktree",
	"runOmp",
	"saveHandoff",
	"mergeWorktree",
	"markCompleted",
	"cleanup",
] as const;

function nowIso(): string {
	return new Date().toISOString();
}

function appendProgress(
	db: SqliteDb,
	missionId: string,
	event: Record<string, unknown>,
): void {
	db.prepare(
		`INSERT INTO progress_log (mission_id, event_type, event_data, timestamp) VALUES (?, ?, ?, ?)`,
	).run(
		missionId,
		String(event.type),
		JSON.stringify(event),
		String(event.timestamp),
	);
}

/**
 * 记录失败现场：feature 置为 failed 并写 progress_log。
 *
 * 只在 feature 行确实存在时才执行——registerFeature 崩溃时行还不存在，
 * 而 progress_log 的外键要求 mission 行存在（feature 行隐含 mission 行已建立）。
 */
function markFeatureFailed(
	db: SqliteDb,
	missionId: string,
	featureId: string,
): void {
	if (
		db.prepare(`SELECT 1 AS ok FROM features WHERE id = ?`).get(featureId) ===
		undefined
	)
		return;

	const timestamp = nowIso();
	db.prepare(
		`UPDATE features SET status = 'failed', updated_at = ? WHERE id = ?`,
	).run(timestamp, featureId);
	appendProgress(db, missionId, {
		type: "worker_completed",
		featureId,
		workerSessionId: "unknown",
		success: false,
		timestamp,
	});
}

/**
 * 单 feature 最小闭环（Phase 1）。
 *
 * 流程：登记 feature → 建 worktree → omp 产出 handoff → 落库 → 合并 → 置 completed → 清理。
 * 每个环节都是一个可恢复 step：崩溃后以同一个 `ctx.workflowId` 重入，已成功的 step 从
 * journal 取回存档结果而不重新执行。
 *
 * 失败路径：feature 置为 failed，worktree 保留供 fix feature 复用，然后向上抛出原始错误。
 *
 * @param ctx - workflow 上下文（含 workflowId 与 step journal）
 * @param db - Lazyforeman 状态库
 * @param input - mission/feature 与需求描述
 */
export async function singleFeatureWorkflow(
	ctx: WorkflowContext,
	db: SqliteDb,
	input: SingleFeatureInput,
): Promise<SingleFeatureResult> {
	const { missionId, featureId, spec } = input;
	let worktreePath: string | undefined;

	try {
		// Step 1: 登记 mission/feature，状态 pending -> in_progress
		await runStep(ctx, "registerFeature", async () => {
			const timestamp = nowIso();
			const missionName = input.missionName ?? missionId;
			const featureName = input.featureName ?? featureId;

			db.prepare(
				`INSERT INTO missions (id, name, description, status, created_at, updated_at)
				 VALUES (?, ?, ?, 'in_progress', ?, ?)
				 ON CONFLICT (id) DO UPDATE SET status = 'in_progress', updated_at = excluded.updated_at`,
			).run(
				missionId,
				missionName,
				`Phase 1 mission for ${featureId}`,
				timestamp,
				timestamp,
			);

			db.prepare(
				`INSERT INTO features (id, mission_id, name, description, status, fulfills, preconditions, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 'in_progress', '[]', '[]', ?, ?)
				 ON CONFLICT (id) DO UPDATE SET status = 'in_progress', updated_at = excluded.updated_at`,
			).run(featureId, missionId, featureName, spec, timestamp, timestamp);

			appendProgress(db, missionId, {
				type: "worker_selected_feature",
				featureId,
				timestamp,
			});

			return featureId;
		});

		// Step 2: 创建隔离 worktree
		const createdPath = await runStep(ctx, "createWorktree", () =>
			createWorktree(featureId),
		);
		worktreePath = createdPath;

		// Step 3: 调用 worker，返回值已在 runner 内通过 Zod schema 校验
		const handoff = await runStep(ctx, "runOmp", () =>
			runOmp(createdPath, featureId, spec),
		);

		// Step 4: handoff 落库（整份 JSON 存 content，字段级查询留给 Phase 2）
		// resume 时 handoff 来自 journal 的反序列化结果，未经校验，因此这里重新过 schema
		const handoffId = await runStep(ctx, "saveHandoff", async () => {
			const validated = HandoffSchema.parse(handoff);
			db.prepare(
				`INSERT INTO handoffs (id, feature_id, content, created_at)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
			).run(
				validated.id,
				validated.featureId,
				JSON.stringify(validated),
				validated.createdAt,
			);
			return validated.id;
		});

		// Step 5: 合并 feature 分支回主仓库当前分支
		await runStep(ctx, "mergeWorktree", () => mergeWorktree(featureId));

		// Step 6: feature 置为 completed
		await runStep(ctx, "markCompleted", async () => {
			const timestamp = nowIso();
			db.prepare(
				`UPDATE features SET status = 'completed', updated_at = ? WHERE id = ?`,
			).run(timestamp, featureId);
			appendProgress(db, missionId, {
				type: "worker_completed",
				featureId,
				workerSessionId: handoff.id,
				success: true,
				timestamp,
			});
			return true;
		});

		// Step 7: 成功收尾，清理 worktree
		await runStep(ctx, "cleanup", () => cleanupWorktree(createdPath, false));

		return { success: true, featureId, handoffId, worktreePath: createdPath };
	} catch (error) {
		console.error(`Workflow failed for ${featureId}:`, error);
		markFeatureFailed(db, missionId, featureId);

		// 失败不走 journal：保留 worktree 供人工或 fix feature 复用
		if (worktreePath) await cleanupWorktree(worktreePath, true);

		throw error;
	}
}
