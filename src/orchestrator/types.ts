import type { DiscoveredIssue } from "../types/handoff.js";

/**
 * Orchestrator 处理 discoveredIssues 后的决策动作
 */
export type IssuesAction =
	| "continue" // 继续执行（无 blocking issues）
	| "pause" // 暂停并等待人工介入
	| "auto_adjust"; // 自动调整计划

/**
 * 按严重程度分类的 issues
 */
export interface ClassifiedIssues {
	blocking: DiscoveredIssue[];
	warning: DiscoveredIssue[];
	info: DiscoveredIssue[];
}

/**
 * 行动建议类型
 */
export type ActionSuggestionType =
	| "create_feature"
	| "update_assertion"
	| "send_signal";

/**
 * 行动建议
 */
export interface ActionSuggestion {
	type: ActionSuggestionType;
	description: string;
	metadata?: Record<string, unknown>;
}

/**
 * Issues 处理结果
 */
export interface IssuesHandlingResult {
	action: IssuesAction;
	issues: ClassifiedIssues;
	suggestions: ActionSuggestion[];
}

/**
 * Issues 处理器接口
 */
export interface IssuesHandler {
	/**
	 * 处理 feature 的 discoveredIssues
	 *
	 * @param featureId - Feature ID
	 * @param handoffId - Handoff ID
	 * @param visionContext - 愿景上下文（可选，用于冲突检测）
	 * @returns 处理结果（是否需要暂停、需要什么行动）
	 */
	handle(
		featureId: string,
		handoffId: string,
		visionContext?: VisionContext,
	): Promise<IssuesHandlingResult>;
}

/**
 * 愿景冲突等级
 */
export type ConflictLevel =
	| "major" // 重大冲突：违背明确目标/边界/核心约束
	| "minor" // 轻微冲突：调整实现细节，核心目标不变
	| "none"; // 无冲突：技术调整，不影响愿景

/**
 * 冲突处理建议
 */
export type ConflictRecommendation =
	| "require_user_decision" // 必须问用户
	| "multi_ai_adjudication" // 多 AI 裁决（feat-011）
	| "auto_approve"; // Orchestrator 自动批准

/**
 * 愿景冲突检测结果
 */
export interface ConflictDetectionResult {
	conflictLevel: ConflictLevel;
	reasoning: string; // AI 推理过程
	recommendation: ConflictRecommendation;
	/** 裁决结果（如果触发了多 AI 裁决） */
	adjudicationResult?: import("../adjudication/types.js").AdjudicationResult;
}

/**
 * 愿景检测上下文
 */
export interface VisionContext {
	missionDocument: import("../types/mission-document.js").MissionDocument; // 来自 mission.md
	kickoffNotes?: string; // 初始访谈记录（可选）
	existingDecisions?: string[]; // 已有的设计决策
}

/**
 * 愿景冲突检测器接口
 */
export interface VisionConflictDetector {
	/**
	 * 检测 discoveredIssue 是否与用户愿景冲突
	 *
	 * @param issue - 需要检测的 issue
	 * @param context - 检测上下文
	 * @returns 冲突检测结果
	 */
	detect(
		issue: DiscoveredIssue,
		context: VisionContext,
	): Promise<ConflictDetectionResult>;
}

/**
 * Plan adjustment result
 */
export interface PlanAdjustmentResult {
	action: "feature_created" | "no_action_needed";
	newFeature?: import("../types/feature.js").Feature;
	updatedFeatures?: import("../types/feature.js").Feature[];
	reasoning: string;
	signalId?: string; // Signal ID if a signal was sent
}

/**
 * Plan Adjuster interface
 */
export interface PlanAdjuster {
	/**
	 * Handle dependency missing (Scenario 1)
	 *
	 * @param issue - dependency_missing type issue
	 * @param originalFeature - Feature that discovered the issue
	 * @returns Adjustment result
	 */
	handleDependencyMissing(
		issue: DiscoveredIssue,
		originalFeature: import("../types/feature.js").Feature,
	): Promise<PlanAdjustmentResult>;

	/**
	 * Handle architecture conflict (Scenario 2)
	 *
	 * @param issue - architecture_conflict type issue
	 * @param originalFeature - Feature that discovered the issue
	 * @param conflictResult - Vision conflict detection result
	 * @returns Adjustment result (with signal ID)
	 */
	handleArchitectureConflict(
		issue: DiscoveredIssue,
		originalFeature: import("../types/feature.js").Feature,
		conflictResult: ConflictDetectionResult,
	): Promise<PlanAdjustmentResult>;
}
