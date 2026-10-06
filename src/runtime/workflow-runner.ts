import type { StepJournal } from "./step-journal.js";

/**
 * 一次 workflow 执行的上下文。
 *
 * `workflowId` 在 resume 时必须复用，否则 journal 中已完成的 step 无法被跳过。
 */
export interface WorkflowContext {
	workflowId: string;
	journal: StepJournal;

	/**
	 * 故障注入 hook（ADR-0001 Q6，仅测试使用）。
	 *
	 * `beforeStep` 在执行前抛出，模拟 step 未落 checkpoint 的崩溃（resume 会重跑该 step）；
	 * `afterStep` 在成功落 checkpoint 之后抛出，模拟崩溃发生在两步之间（resume 不重跑该 step）。
	 */
	_testHooks?: {
		beforeStep?: (stepName: string) => void | Promise<void>;
		afterStep?: (stepName: string) => void | Promise<void>;
	};
}

/**
 * 执行一个可恢复的 step。
 *
 * 语义（ADR-0001）：
 * - journal 中已 `success` → 直接返回存档输出，不重新执行
 * - `failed` 或 `started` 残留 → 重新执行
 *
 * @param ctx - workflow 上下文
 * @param stepName - step 名，在同一 workflowId 内唯一
 * @param fn - step 实现，返回值必须 JSON 可序列化
 */
export async function runStep<T>(
	ctx: WorkflowContext,
	stepName: string,
	fn: () => Promise<T>,
): Promise<T> {
	const completed = await ctx.journal.getCompletedSteps(ctx.workflowId);
	if (completed.has(stepName)) {
		console.log(`⏩ Step '${stepName}' already completed, skipping`);
		return completed.get(stepName) as T;
	}

	await ctx._testHooks?.beforeStep?.(stepName);

	await ctx.journal.recordStepStart(ctx.workflowId, stepName, undefined);
	console.log(`▶️  Step '${stepName}' started`);

	let result: T;
	try {
		result = await fn();
	} catch (error) {
		await ctx.journal.recordStepFailure(ctx.workflowId, stepName, error);
		console.error(`❌ Step '${stepName}' failed:`, error);
		throw error;
	}

	// checkpoint 一旦写入即为终态：afterStep 的抛出不再改写 journal，
	// 否则"崩溃发生在成功之后"会被误记为失败并在 resume 时重复执行。
	await ctx.journal.recordStepSuccess(ctx.workflowId, stepName, result);
	console.log(`✅ Step '${stepName}' completed`);

	await ctx._testHooks?.afterStep?.(stepName);

	return result;
}

/** Phase 1 支持的 workflow 类型 */
export type WorkflowType = "single-feature" | "milestone";

/**
 * 生成 workflow 标识。
 *
 * 带时间戳，因此每次新执行都是全新 workflow；resume 必须复用首次生成的值。
 *
 * @param type - workflow 类型
 * @param entityId - mission 或 feature 的 ID
 */
export function generateWorkflowId(
	type: WorkflowType,
	entityId: string,
): string {
	return `${type}:${entityId}:${new Date().toISOString()}`;
}
