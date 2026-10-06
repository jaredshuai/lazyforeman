import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import { DefaultSignalManager } from "../../src/signals/manager.js";
import {
	resumeWorkflow,
	getBlockingSignal,
	waitForSignalResolution,
} from "../../src/signals/workflow-resume.js";
import {
	mockPendingSignal,
	mockPendingSignalData,
	mockApproveResolution,
	mockRejectResolution,
	mockModifyResolution,
} from "./fixtures/mock-signals.js";
import type { SqliteDb } from "../../src/db/connection.js";

describe("Workflow Resume", () => {
	let db: SqliteDb;
	let manager: DefaultSignalManager;

	beforeEach(() => {
		db = openDatabase(":memory:");
		manager = new DefaultSignalManager(db);
	});

	describe("resumeWorkflow()", () => {
		it("should resume workflow after approve decision", async () => {
			// 1. 发送信号
			const signalId = await manager.send(mockPendingSignalData);

			// 2. 用户批准
			await manager.recv(signalId, mockApproveResolution);

			// 3. 恢复 workflow
			await expect(
				resumeWorkflow("feat-001", signalId, manager),
			).resolves.toBeUndefined();
		});

		it("should resume workflow after reject decision", async () => {
			const signalId = await manager.send(mockPendingSignalData);
			await manager.recv(signalId, mockRejectResolution);

			await expect(
				resumeWorkflow("feat-001", signalId, manager),
			).resolves.toBeUndefined();
		});

		it("should resume workflow after modify decision", async () => {
			const signalId = await manager.send(mockPendingSignalData);
			await manager.recv(signalId, mockModifyResolution);

			await expect(
				resumeWorkflow("feat-001", signalId, manager),
			).resolves.toBeUndefined();
		});

		it("should throw error if signal not found", async () => {
			await expect(
				resumeWorkflow("feat-001", "SIG-999", manager),
			).rejects.toThrow("not found");
		});

		it("should throw error if signal not resolved", async () => {
			const signalId = await manager.send(mockPendingSignalData);

			await expect(
				resumeWorkflow("feat-001", signalId, manager),
			).rejects.toThrow("not resolved");
		});

		it("should throw error if resolution missing", async () => {
			// 手动创建一个 resolved 但没有 resolution 的异常状态
			const signalId = await manager.send(mockPendingSignalData);

			// 直接修改数据库（模拟异常）
			db.prepare(
				"UPDATE signals SET status = 'resolved', resolved_at = ? WHERE id = ?",
			).run(new Date().toISOString(), signalId);

			await expect(
				resumeWorkflow("feat-001", signalId, manager),
			).rejects.toThrow("has no resolution");
		});
	});

	describe("getBlockingSignal()", () => {
		it("should find blocking signal for feature", async () => {
			const signalId = await manager.send(mockPendingSignalData);

			const blockingSignal = await getBlockingSignal("feat-001", manager);

			expect(blockingSignal).toBeDefined();
			expect(blockingSignal?.id).toBe(signalId);
			expect(blockingSignal?.payload.featureId).toBe("feat-001");
		});

		it("should return null if no blocking signal", async () => {
			const blockingSignal = await getBlockingSignal("feat-999", manager);
			expect(blockingSignal).toBeNull();
		});

		it("should not return resolved signals", async () => {
			const signalId = await manager.send(mockPendingSignalData);
			await manager.recv(signalId, mockApproveResolution);

			const blockingSignal = await getBlockingSignal("feat-001", manager);
			expect(blockingSignal).toBeNull();
		});

		it("should handle multiple pending signals", async () => {
			// 为不同 feature 发送信号
			await manager.send(mockPendingSignalData);
			await manager.send({
				...mockPendingSignalData,
				payload: {
					...mockPendingSignalData.payload,
					featureId: "feat-002",
				},
			});

			const blocking1 = await getBlockingSignal("feat-001", manager);
			const blocking2 = await getBlockingSignal("feat-002", manager);

			expect(blocking1?.payload.featureId).toBe("feat-001");
			expect(blocking2?.payload.featureId).toBe("feat-002");
		});
	});

	describe("waitForSignalResolution()", () => {
		it("should return immediately if already resolved", async () => {
			const signalId = await manager.send(mockPendingSignalData);
			await manager.recv(signalId, mockApproveResolution);

			const signal = await waitForSignalResolution(
				signalId,
				manager,
				100,
				1000,
			);

			expect(signal.status).toBe("resolved");
			expect(signal.resolution).toEqual(mockApproveResolution);
		});

		it("should wait for resolution", async () => {
			const signalId = await manager.send(mockPendingSignalData);

			// 模拟异步解决
			setTimeout(async () => {
				await manager.recv(signalId, mockApproveResolution);
			}, 200);

			const signal = await waitForSignalResolution(
				signalId,
				manager,
				100,
				2000,
			);

			expect(signal.status).toBe("resolved");
		});

		it("should throw error if signal abandoned", async () => {
			const signalId = await manager.send(mockPendingSignalData);

			// 手动标记为 abandoned
			db.prepare("UPDATE signals SET status = 'abandoned' WHERE id = ?").run(
				signalId,
			);

			await expect(
				waitForSignalResolution(signalId, manager, 100, 1000),
			).rejects.toThrow("was abandoned");
		});

		it("should throw error on timeout", async () => {
			const signalId = await manager.send(mockPendingSignalData);

			await expect(
				waitForSignalResolution(signalId, manager, 100, 500),
			).rejects.toThrow("Timeout");
		}, 1000);

		it("should throw error if signal not found", async () => {
			await expect(
				waitForSignalResolution("SIG-999", manager, 100, 1000),
			).rejects.toThrow("not found");
		});
	});

	describe("Workflow integration scenarios", () => {
		it("should handle approve -> continue workflow", async () => {
			// 1. Worker 检测到冲突，发送 signal
			const signalId = await manager.send(mockPendingSignalData);

			// 2. Workflow 暂停
			const blockingSignal = await getBlockingSignal("feat-001", manager);
			expect(blockingSignal).toBeDefined();

			// 3. 用户批准
			await manager.recv(signalId, mockApproveResolution);

			// 4. Workflow 恢复
			await resumeWorkflow("feat-001", signalId, manager);

			// 5. 验证 signal 已解决
			const signal = await manager.get(signalId);
			expect(signal?.status).toBe("resolved");
			expect(signal?.resolution?.decision).toBe("approve");
		});

		it("should handle reject -> mark feature failed", async () => {
			const signalId = await manager.send(mockPendingSignalData);
			await manager.recv(signalId, mockRejectResolution);
			await resumeWorkflow("feat-001", signalId, manager);

			const signal = await manager.get(signalId);
			expect(signal?.resolution?.decision).toBe("reject");
		});

		it("should handle modify -> apply new plan", async () => {
			const signalId = await manager.send(mockPendingSignalData);
			await manager.recv(signalId, mockModifyResolution);
			await resumeWorkflow("feat-001", signalId, manager);

			const signal = await manager.get(signalId);
			expect(signal?.resolution?.decision).toBe("modify");
			expect(signal?.resolution?.modifiedPlan).toBeDefined();
		});
	});
});
