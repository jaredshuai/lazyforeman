import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import { DefaultSignalManager } from "../../src/signals/manager.js";
import {
	mockPendingSignal,
	mockPendingSignalData,
	mockApproveResolution,
	mockRejectResolution,
	mockModifyResolution,
	mockInvalidResolution,
	mockIncompleteResolution,
} from "./fixtures/mock-signals.js";
import type { SqliteDb } from "../../src/db/connection.js";

describe("recv() - Signal Resolution", () => {
	let db: SqliteDb;
	let manager: DefaultSignalManager;

	beforeEach(() => {
		// 使用唯一的内存数据库名称进行测试（避免测试间干扰）
		db = openDatabase(`:memory:`);
		manager = new DefaultSignalManager(db);
	});

	afterEach(() => {
		// 关闭数据库连接
		if (db) {
			db.close();
		}
	});

	it("should update signal status to resolved", async () => {
		// 1. 发送信号
		const signalId = await manager.send(mockPendingSignalData);

		// 2. 接收解决方案
		await manager.recv(signalId, mockApproveResolution);

		// 3. 验证状态
		const signal = await manager.get(signalId);
		expect(signal).toBeDefined();
		expect(signal?.status).toBe("resolved");
		expect(signal?.resolvedAt).toBeDefined();
	});

	it("should record resolution details", async () => {
		// 1. 发送信号
		const signalId = await manager.send(mockPendingSignalData);

		// 2. 接收解决方案
		await manager.recv(signalId, mockApproveResolution);

		// 3. 验证 resolution
		const signal = await manager.get(signalId);
		expect(signal?.resolution).toEqual(mockApproveResolution);
		expect(signal?.resolution?.decision).toBe("approve");
		expect(signal?.resolution?.reasoning).toBe(mockApproveResolution.reasoning);
	});

	it("should only recv pending signals", async () => {
		// 1. 发送并解决信号
		const signalId = await manager.send(mockPendingSignalData);
		await manager.recv(signalId, mockApproveResolution);

		// 2. 尝试再次解决
		await expect(manager.recv(signalId, mockRejectResolution)).rejects.toThrow(
			"is not pending",
		);
	});

	it("should throw error for non-existent signal", async () => {
		await expect(
			manager.recv("SIG-999", mockApproveResolution),
		).rejects.toThrow("not found");
	});

	it("should handle approve decision", async () => {
		const signalId = await manager.send(mockPendingSignalData);
		await manager.recv(signalId, mockApproveResolution);

		const signal = await manager.get(signalId);
		expect(signal?.resolution?.decision).toBe("approve");
	});

	it("should handle reject decision", async () => {
		const signalId = await manager.send(mockPendingSignalData);
		await manager.recv(signalId, mockRejectResolution);

		const signal = await manager.get(signalId);
		expect(signal?.resolution?.decision).toBe("reject");
	});

	it("should handle modify decision with plan", async () => {
		const signalId = await manager.send(mockPendingSignalData);
		await manager.recv(signalId, mockModifyResolution);

		const signal = await manager.get(signalId);
		expect(signal?.resolution?.decision).toBe("modify");
		expect(signal?.resolution?.modifiedPlan).toBeDefined();
		expect(signal?.resolution?.modifiedPlan).toEqual(
			mockModifyResolution.modifiedPlan,
		);
	});

	it("should validate resolution input - reasoning too short", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		await expect(
			manager.recv(signalId, mockInvalidResolution as any),
		).rejects.toThrow("Invalid resolution");
	});

	it("should validate resolution input - missing required fields", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		await expect(
			manager.recv(signalId, mockIncompleteResolution as any),
		).rejects.toThrow("Invalid resolution");
	});

	it("should validate decision enum", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		const invalidDecision = {
			decision: "invalid_decision",
			reasoning: "This is a valid reasoning text",
			resolvedBy: "user",
		};

		await expect(
			manager.recv(signalId, invalidDecision as any),
		).rejects.toThrow("Invalid resolution");
	});

	it("should validate resolvedBy enum", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		const invalidResolvedBy = {
			decision: "approve",
			reasoning: "This is a valid reasoning text",
			resolvedBy: "invalid_resolver",
		};

		await expect(
			manager.recv(signalId, invalidResolvedBy as any),
		).rejects.toThrow("Invalid resolution");
	});

	it("should allow system to resolve signals", async () => {
		const signalId = await manager.send(mockPendingSignalData);

		const systemResolution = {
			decision: "approve" as const,
			reasoning: "Automatically approved by system validation",
			resolvedBy: "system" as const,
		};

		await manager.recv(signalId, systemResolution);

		const signal = await manager.get(signalId);
		expect(signal?.resolution?.resolvedBy).toBe("system");
	});

	it("should handle multiple signals independently", async () => {
		// 发送两个信号
		const signal1Id = await manager.send(mockPendingSignalData);
		const signal2Id = await manager.send({
			...mockPendingSignalData,
			payload: {
				...mockPendingSignalData.payload,
				featureId: "feat-002",
			},
		});

		// 解决第一个
		await manager.recv(signal1Id, mockApproveResolution);

		// 验证状态
		const signal1 = await manager.get(signal1Id);
		const signal2 = await manager.get(signal2Id);

		expect(signal1?.status).toBe("resolved");
		expect(signal2?.status).toBe("pending");
	});

	it("should preserve signal payload after resolution", async () => {
		const signalId = await manager.send(mockPendingSignalData);
		await manager.recv(signalId, mockApproveResolution);

		const signal = await manager.get(signalId);
		expect(signal?.payload).toEqual(mockPendingSignal.payload);
		expect(signal?.payload.featureId).toBe("feat-001");
	});
});
