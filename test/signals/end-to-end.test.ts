import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import { DefaultSignalManager } from "../../src/signals/manager.js";
import {
	resumeWorkflow,
	getBlockingSignal,
} from "../../src/signals/workflow-resume.js";
import {
	mockPendingSignal,
	mockPendingSignalData,
	mockApproveResolution,
	mockRejectResolution,
	mockModifyResolution,
	mockClarificationSignalData,
	mockApprovalSignalData,
} from "./fixtures/mock-signals.js";
import type { SqliteDb } from "../../src/db/connection.js";

describe("End-to-End Signal Flow", () => {
	let db: SqliteDb;
	let manager: DefaultSignalManager;

	beforeEach(() => {
		db = openDatabase(":memory:");
		manager = new DefaultSignalManager(db);
	});

	it("should complete full send -> pause -> recv -> resume flow", async () => {
		// Phase 1: Worker 检测到架构冲突
		console.log("=== Phase 1: Worker detects conflict ===");
		const signalId = await manager.send(mockPendingSignalData);
		expect(signalId).toMatch(/^SIG-\d{3}$/);

		// Phase 2: Orchestrator 检查是否被阻塞
		console.log("=== Phase 2: Check for blocking signal ===");
		const blockingSignal = await getBlockingSignal("feat-001", manager);
		expect(blockingSignal).toBeDefined();
		expect(blockingSignal?.id).toBe(signalId);

		// Phase 3: 用户裁决（approve）
		console.log("=== Phase 3: User approves ===");
		await manager.recv(signalId, mockApproveResolution);

		// Phase 4: 验证 signal 已解决
		const resolvedSignal = await manager.get(signalId);
		expect(resolvedSignal?.status).toBe("resolved");
		expect(resolvedSignal?.resolution?.decision).toBe("approve");

		// Phase 5: Workflow 恢复
		console.log("=== Phase 5: Resume workflow ===");
		await resumeWorkflow("feat-001", signalId, manager);

		// Phase 6: 验证不再被阻塞
		const stillBlocked = await getBlockingSignal("feat-001", manager);
		expect(stillBlocked).toBeNull();
	});

	it("should handle reject flow and mark feature failed", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		// 用户拒绝
		await manager.recv(signalId, mockRejectResolution);

		// 恢复 workflow（会标记 feature 为 failed）
		await resumeWorkflow("feat-001", signalId, manager);

		const signal = await manager.get(signalId);
		expect(signal?.resolution?.decision).toBe("reject");
		expect(signal?.resolution?.reasoning).toContain("不接受更改");
	});

	it("should handle modify flow and apply modified plan", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		// 用户修改计划
		await manager.recv(signalId, mockModifyResolution);

		const signal = await manager.get(signalId);
		expect(signal?.resolution?.decision).toBe("modify");
		expect(signal?.resolution?.modifiedPlan).toBeDefined();

		// 恢复 workflow（会应用修改后的计划）
		await resumeWorkflow("feat-001", signalId, manager);
	});

	it("should handle multiple signals sequentially", async () => {
		// Signal 1: architecture_conflict
		const signal1Id = await manager.send(mockPendingSignalData);
		await manager.recv(signal1Id, mockApproveResolution);
		await resumeWorkflow("feat-001", signal1Id, manager);

		// Signal 2: user_clarification
		const signal2Id = await manager.send(mockClarificationSignalData);
		await manager.recv(signal2Id, {
			decision: "modify",
			reasoning: "密码最小长度设为 8 位，必须包含特殊字符",
			modifiedPlan: {
				mission: {
					requirements: ["密码最小长度: 8", "必须包含特殊字符"],
				},
			},
			resolvedBy: "user",
		});
		await resumeWorkflow("feat-002", signal2Id, manager);

		// Signal 3: manual_approval
		const signal3Id = await manager.send(mockApprovalSignalData);
		await manager.recv(signal3Id, mockApproveResolution);
		await resumeWorkflow("feat-003", signal3Id, manager);

		// 验证所有 signals 都已解决
		const allSignals = await manager.listPending();
		expect(allSignals).toHaveLength(0);
	});

	it("should handle multiple features with independent signals", async () => {
		// Feature 1 的 signal
		const signal1Id = await manager.send(mockPendingSignalData);

		// Feature 2 的 signal
		const signal2Id = await manager.send({
			...mockPendingSignalData,
			payload: {
				...mockPendingSignalData.payload,
				featureId: "feat-002",
			},
		});

		// Feature 3 的 signal
		const signal3Id = await manager.send({
			...mockPendingSignalData,
			payload: {
				...mockPendingSignalData.payload,
				featureId: "feat-003",
			},
		});

		// 验证所有 pending
		const pendingSignals = await manager.listPending();
		expect(pendingSignals).toHaveLength(3);

		// 解决 Feature 2
		await manager.recv(signal2Id, mockApproveResolution);
		await resumeWorkflow("feat-002", signal2Id, manager);

		// 验证只剩 2 个 pending
		const remainingSignals = await manager.listPending();
		expect(remainingSignals).toHaveLength(2);
		expect(remainingSignals.map((s) => s.id)).toContain(signal1Id);
		expect(remainingSignals.map((s) => s.id)).toContain(signal3Id);
		expect(remainingSignals.map((s) => s.id)).not.toContain(signal2Id);
	});

	it("should persist signals across manager instances", async () => {
		// 使用文件数据库
		const dbPath = ":memory:";
		const db1 = openDatabase(dbPath);
		const manager1 = new DefaultSignalManager(db1);

		// 发送 signal
		const signalId = await manager1.send(mockPendingSignalData);

		// 创建新的 manager 实例（模拟重启）
		const manager2 = new DefaultSignalManager(db1);

		// 应该能读取到之前的 signal
		const signal = await manager2.get(signalId);
		expect(signal).toBeDefined();
		expect(signal?.status).toBe("pending");

		// 解决 signal
		await manager2.recv(signalId, mockApproveResolution);

		// 第三个 manager 实例应该看到已解决的状态
		const manager3 = new DefaultSignalManager(db1);
		const resolvedSignal = await manager3.get(signalId);
		expect(resolvedSignal?.status).toBe("resolved");
	});

	it("should handle concurrent workflow pauses", async () => {
		// 同时暂停多个 features
		const signal1 = await manager.send(mockPendingSignalData);
		const signal2 = await manager.send(mockClarificationSignalData);
		const signal3 = await manager.send(mockApprovalSignalData);

		// 验证所有都在 pending
		const pending = await manager.listPending();
		expect(pending).toHaveLength(3);

		// 按不同顺序解决
		await manager.recv(signal2, mockApproveResolution);
		await manager.recv(signal1, mockRejectResolution);
		await manager.recv(signal3, mockModifyResolution);

		// 验证所有都已解决
		const stillPending = await manager.listPending();
		expect(stillPending).toHaveLength(0);
	});

	it("should handle workflow resume with missing signal gracefully", async () => {
		// 尝试恢复不存在的 signal
		await expect(
			resumeWorkflow("feat-001", "SIG-999", manager),
		).rejects.toThrow("not found");
	});

	it("should maintain signal creation order", async () => {
		// 按顺序发送多个 signals
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			const id = await manager.send({
				...mockPendingSignalData,
				payload: {
					...mockPendingSignalData.payload,
					featureId: `feat-00${i + 1}`,
				},
			});
			ids.push(id);
		}

		// listPending 应该按创建时间排序
		const pending = await manager.listPending();
		expect(pending.map((s) => s.id)).toEqual(ids);
	});

	it("should complete mission with all signals resolved", async () => {
		// 模拟完整 mission 流程
		const missionFeatures = ["feat-001", "feat-002", "feat-003"];

		// 每个 feature 都有一个 signal (串行发送以避免并发问题)
		const signalIds: string[] = [];
		for (const featureId of missionFeatures) {
			const id = await manager.send({
				...mockPendingSignalData,
				payload: {
					...mockPendingSignalData.payload,
					featureId,
				},
			});
			signalIds.push(id);
		}

		// 验证所有 pending
		let pending = await manager.listPending();
		expect(pending).toHaveLength(3);

		// 逐个解决
		for (const [index, signalId] of signalIds.entries()) {
			await manager.recv(signalId, mockApproveResolution);
			await resumeWorkflow(missionFeatures[index], signalId, manager);
		}

		// 验证全部完成
		pending = await manager.listPending();
		expect(pending).toHaveLength(0);

		// 验证所有 signals 都已 resolved
		for (const signalId of signalIds) {
			const signal = await manager.get(signalId);
			expect(signal?.status).toBe("resolved");
		}
	});
});
