import type { SignalManager } from "./manager.js";
import type { Signal } from "./types.js";

/**
 * Workflow 恢复机制（feat-010）
 *
 * 根据用户对 signal 的裁决恢复 workflow 执行
 */

/**
 * 恢复被暂停的 workflow
 *
 * @param featureId - Feature ID
 * @param signalId - Signal ID
 * @param signalManager - Signal Manager 实例
 */
export async function resumeWorkflow(
	featureId: string,
	signalId: string,
	signalManager: SignalManager,
): Promise<void> {
	// 1. 验证 signal 已解决
	const signal = await signalManager.get(signalId);

	if (!signal) {
		throw new Error(`Signal ${signalId} not found`);
	}

	if (signal.status !== "resolved") {
		throw new Error(`Cannot resume: signal ${signalId} not resolved`);
	}

	const resolution = signal.resolution;
	if (!resolution) {
		throw new Error(`Signal ${signalId} has no resolution`);
	}

	// 2. 根据用户决策执行不同操作
	console.log(
		`[Workflow] Resuming feature ${featureId} after signal ${signalId}`,
	);

	if (resolution.decision === "approve") {
		// 批准 Worker 的建议，继续执行
		console.log("[Workflow] Decision: APPROVE - continuing with suggested fix");
		await applySuggestedFix(signal);
	} else if (resolution.decision === "reject") {
		// 拒绝建议，feature 标记为 failed
		console.log("[Workflow] Decision: REJECT - marking feature as failed");
		await markFeatureFailed(featureId, resolution.reasoning);
	} else if (resolution.decision === "modify") {
		// 应用修改后的计划
		console.log("[Workflow] Decision: MODIFY - applying modified plan");
		await applyModifiedPlan(signal, resolution.modifiedPlan);
	}

	// 3. 恢复 workflow（实际实现需要集成到 Orchestrator）
	console.log(`[Workflow] Feature ${featureId} workflow resumed`);
}

/**
 * 应用 Worker 建议的修复
 */
async function applySuggestedFix(signal: Signal): Promise<void> {
	const suggestedActions = signal.payload.suggestedActions;

	if (!suggestedActions || suggestedActions.length === 0) {
		console.log("[Workflow] No suggested actions to apply");
		return;
	}

	console.log("[Workflow] Applying suggested actions:");
	for (const action of suggestedActions) {
		console.log(`  - ${action}`);
	}

	// TODO: 实际应用修复逻辑
	// 例如：更新 mission.md、调整 features.json、重新分配断言
}

/**
 * 标记 feature 为失败
 */
async function markFeatureFailed(
	featureId: string,
	reasoning: string,
): Promise<void> {
	console.log(`[Workflow] Marking feature ${featureId} as failed`);
	console.log(`  Reason: ${reasoning}`);

	// TODO: 更新 features 表
	// UPDATE features SET status = 'failed' WHERE id = ?
}

/**
 * 应用用户修改的计划
 */
async function applyModifiedPlan(
	signal: Signal,
	modifiedPlan: unknown,
): Promise<void> {
	console.log("[Workflow] Applying modified plan");

	if (!modifiedPlan) {
		throw new Error("Modified plan is required for 'modify' decision");
	}

	// TODO: 根据 modifiedPlan 的结构应用修改
	// 例如：
	// - 更新 mission.md
	// - 重新提取 assertions.json
	// - 重新拆分 features.json
	// - 更新断言认领关系

	console.log("[Workflow] Modified plan applied successfully");
}

/**
 * 检查 feature 是否被 signal 阻塞
 *
 * @param featureId - Feature ID
 * @param signalManager - Signal Manager 实例
 * @returns 阻塞的 signal，如果没有则返回 null
 */
export async function getBlockingSignal(
	featureId: string,
	signalManager: SignalManager,
): Promise<Signal | null> {
	const pendingSignals = await signalManager.listPending();

	// 查找与该 feature 相关的 pending signal
	const blockingSignal = pendingSignals.find(
		(s) => s.payload.featureId === featureId,
	);

	return blockingSignal || null;
}

/**
 * 等待 signal 解决
 *
 * @param signalId - Signal ID
 * @param signalManager - Signal Manager 实例
 * @param pollInterval - 轮询间隔（毫秒）
 * @param timeout - 超时时间（毫秒）
 * @returns 解决后的 signal
 */
export async function waitForSignalResolution(
	signalId: string,
	signalManager: SignalManager,
	pollInterval = 5000,
	timeout = 24 * 60 * 60 * 1000, // 24 小时
): Promise<Signal> {
	const startTime = Date.now();

	while (true) {
		const signal = await signalManager.get(signalId);

		if (!signal) {
			throw new Error(`Signal ${signalId} not found`);
		}

		if (signal.status === "resolved") {
			return signal;
		}

		if (signal.status === "abandoned") {
			throw new Error(`Signal ${signalId} was abandoned`);
		}

		// 检查超时
		if (Date.now() - startTime > timeout) {
			throw new Error(`Timeout waiting for signal ${signalId} resolution`);
		}

		// 等待下一次轮询
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}
}
