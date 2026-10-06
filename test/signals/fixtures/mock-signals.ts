import type { Signal, SignalResolution } from "../../../src/signals/types.js";

/**
 * Mock data for signal testing (feat-010)
 */

/**
 * Mock pending signal data (without id/createdAt, for use with send())
 */
export const mockPendingSignalData: Omit<Signal, "id" | "createdAt"> = {
	type: "architecture_conflict",
	status: "pending",
	payload: {
		featureId: "feat-001",
		issueId: "ISS-001",
		conflictDetails: {
			conflictLevel: "major",
			reasoning: "Worker 建议使用 RS256 算法，但 mission.md 要求使用 HS256",
			recommendation: "require_user_decision",
		},
		suggestedActions: [
			"更新 mission.md，允许使用 RS256",
			"保持 HS256 并调整 Worker 实现",
		],
	},
};

/**
 * Mock pending signal (with id, for reference)
 */
export const mockPendingSignal: Signal = {
	id: "SIG-001",
	createdAt: "2026-10-06T10:00:00Z",
	...mockPendingSignalData,
};

/**
 * Mock approve resolution
 */
export const mockApproveResolution: SignalResolution = {
	decision: "approve",
	reasoning: "同意使用 RS256 算法，与现有系统保持一致",
	resolvedBy: "user",
};

/**
 * Mock reject resolution
 */
export const mockRejectResolution: SignalResolution = {
	decision: "reject",
	reasoning: "不接受更改，坚持使用 HS256",
	resolvedBy: "user",
};

/**
 * Mock modify resolution
 */
export const mockModifyResolution: SignalResolution = {
	decision: "modify",
	reasoning: "采用折中方案：支持两种算法",
	modifiedPlan: {
		mission: {
			architectureConstraints: ["支持 HS256 和 RS256 两种 JWT 签名算法"],
		},
		features: {
			"feat-001": {
				description: "实现 JWT 签名，支持 HS256 和 RS256",
			},
		},
	},
	resolvedBy: "user",
};

/**
 * Mock resolved signal (approved)
 */
export const mockResolvedSignal: Signal = {
	...mockPendingSignal,
	status: "resolved",
	resolvedAt: "2026-10-06T11:00:00Z",
	resolution: mockApproveResolution,
};

/**
 * Mock abandoned signal
 */
export const mockAbandonedSignal: Signal = {
	...mockPendingSignal,
	id: "SIG-002",
	status: "abandoned",
	createdAt: "2026-09-01T10:00:00Z", // 超时
};

/**
 * Mock user clarification signal (without id, for send())
 */
export const mockClarificationSignalData: Omit<Signal, "id" | "createdAt"> = {
	type: "user_clarification",
	status: "pending",
	payload: {
		featureId: "feat-002",
		issueId: "ISS-002",
		conflictDetails: {
			conflictLevel: "minor",
			reasoning: "需要明确密码强度要求",
			recommendation: "require_user_decision",
		},
		suggestedActions: ["明确密码最小长度", "是否需要特殊字符"],
	},
};

/**
 * Mock user clarification signal (with id, for reference)
 */
export const mockClarificationSignal: Signal = {
	id: "SIG-003",
	createdAt: "2026-10-06T12:00:00Z",
	...mockClarificationSignalData,
};

/**
 * Mock manual approval signal (without id, for send())
 */
export const mockApprovalSignalData: Omit<Signal, "id" | "createdAt"> = {
	type: "manual_approval",
	status: "pending",
	payload: {
		featureId: "feat-003",
		issueId: "ISS-003",
		conflictDetails: {
			conflictLevel: "major",
			reasoning: "需要手动批准数据库迁移",
			recommendation: "require_user_decision",
		},
		suggestedActions: ["审查 migration 脚本", "在测试环境验证"],
	},
};

/**
 * Mock manual approval signal (with id, for reference)
 */
export const mockApprovalSignal: Signal = {
	id: "SIG-004",
	createdAt: "2026-10-06T13:00:00Z",
	...mockApprovalSignalData,
};

/**
 * Mock system resolution
 */
export const mockSystemResolution: SignalResolution = {
	decision: "approve",
	reasoning: "自动批准：通过了所有预检查",
	resolvedBy: "system",
};

/**
 * Mock invalid resolution (for validation tests)
 */
export const mockInvalidResolution = {
	decision: "approve",
	reasoning: "too short", // 少于 10 个字符
	resolvedBy: "user",
};

/**
 * Mock resolution without required fields
 */
export const mockIncompleteResolution = {
	decision: "approve",
	// missing reasoning and resolvedBy
};
