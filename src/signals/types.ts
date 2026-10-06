/**
 * Signal 类型定义（feat-007）
 *
 * 用于 Orchestrator 向外部发送需要人工裁决的信号
 */

import type { ConflictDetectionResult } from "../orchestrator/types.js";

// Re-export for backward compatibility
export type { ConflictDetectionResult };

/**
 * Signal 记录
 */
export interface Signal {
	/** 信号 ID（格式：SIG-001） */
	id: string;
	/** 信号类型 */
	type: SignalType;
	/** 信号状态 */
	status: SignalStatus;
	/** 信号负载 */
	payload: SignalPayload;
	/** 创建时间 */
	createdAt: string;
	/** 解决时间 */
	resolvedAt?: string;
	/** 解决方案 */
	resolution?: SignalResolution;
}

/**
 * Signal 类型
 */
export type SignalType =
	| "architecture_conflict" // 架构冲突需要裁决
	| "user_clarification" // 需要用户澄清
	| "manual_approval"; // 需要人工批准

/**
 * Signal 状态
 */
export type SignalStatus =
	| "pending" // 等待处理
	| "resolved" // 已解决
	| "abandoned"; // 超时/废弃

/**
 * Signal 负载
 */
export interface SignalPayload {
	/** Feature ID */
	featureId: string;
	/** Issue ID */
	issueId: string;
	/** 冲突检测结果 */
	conflictDetails: ConflictDetectionResult;
	/** 建议的行动 */
	suggestedActions?: string[];
	/** 裁决结果（如果触发了多 AI 裁决） */
	adjudicationResult?: import("../adjudication/types.js").AdjudicationResult;
}

/**
 * Signal 解决方案
 */
export interface SignalResolution {
	/** 决策 */
	decision: "approve" | "reject" | "modify";
	/** 推理过程 */
	reasoning: string;
	/** 修改后的计划（如果选择 modify） */
	modifiedPlan?: unknown;
	/** 解决者 */
	resolvedBy: "user" | "system";
}
