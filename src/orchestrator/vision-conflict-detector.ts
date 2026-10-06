import type { DiscoveredIssue } from "../types/handoff.js";
import type { MissionDocument } from "../types/mission-document.js";
import type {
	ConflictDetectionResult,
	VisionConflictDetector,
	VisionContext,
} from "./types.js";

/**
 * 默认愿景冲突检测器
 *
 * 根据 ADR-0003 §6.2 的判定标准检测 Worker 提出的改动是否与用户愿景冲突
 *
 * Phase 2.2 使用规则引擎 + mock AI，未来可接入真实 LLM
 */
export class DefaultVisionConflictDetector implements VisionConflictDetector {
	async detect(
		issue: DiscoveredIssue,
		context: VisionContext,
	): Promise<ConflictDetectionResult> {
		// 1. 提取关键信息
		const goal = context.missionDocument.goal;
		const boundaries = context.missionDocument.boundaries;
		const constraints = context.missionDocument.architectureConstraints;

		// 2. 检测是否违反边界
		const violatesBoundary = this.checkBoundaryViolation(issue, boundaries);
		if (violatesBoundary) {
			return {
				conflictLevel: "major",
				reasoning: `提议的改动违反了明确的边界约束：${violatesBoundary}`,
				recommendation: "require_user_decision",
			};
		}

		// 3. 检测是否违反核心约束
		const violatesConstraint = this.checkConstraintViolation(
			issue,
			constraints,
		);
		if (violatesConstraint) {
			return {
				conflictLevel: "major",
				reasoning: `提议的改动违反了架构约束：${violatesConstraint}`,
				recommendation: "require_user_decision",
			};
		}

		// 4. For architecture_conflict category, check if it describes a conflict with existing code
		if (issue.category === "architecture_conflict") {
			// Check if description mentions actual conflict with mission requirements
			const conflictKeywords = ["冲突", "不一致", "违反", "矛盾"];
			const issueText = `${issue.description} ${issue.context || ""}`;

			if (conflictKeywords.some((keyword) => issueText.includes(keyword))) {
				return {
					conflictLevel: "major",
					reasoning: `架构冲突：${issue.description}`,
					recommendation: "require_user_decision",
				};
			}

			// Non-critical architecture issues are minor
			return {
				conflictLevel: "minor",
				reasoning: "架构调整建议，但不是严重冲突",
				recommendation: "multi_ai_adjudication",
			};
		}

		// 5. 检测是否影响核心目标
		const affectsGoal = this.checkGoalImpact(issue, goal);
		if (affectsGoal) {
			return {
				conflictLevel: "minor",
				reasoning: "改动可能影响目标实现方式，但不违背目标本身",
				recommendation: "multi_ai_adjudication",
			};
		}

		// 6. 无冲突
		return {
			conflictLevel: "none",
			reasoning: "技术调整，不影响用户愿景",
			recommendation: "auto_approve",
		};
	}

	/**
	 * 检查是否违反边界
	 *
	 * @param issue - 待检测的 issue
	 * @param boundaries - Mission 边界
	 * @returns 违反的边界项，或 null
	 */
	private checkBoundaryViolation(
		issue: DiscoveredIssue,
		boundaries: MissionDocument["boundaries"],
	): string | null {
		// 检查 suggestedFix 是否提议做"不做清单"中的事
		const outOfScope = boundaries.outOfScope;

		for (const item of outOfScope) {
			if (this.matchesKeywords(issue.suggestedFix || "", item)) {
				return item;
			}
			// 也检查 description，因为有些 issue 没有 suggestedFix
			if (this.matchesKeywords(issue.description, item)) {
				return item;
			}
		}

		return null;
	}

	/**
	 * 检查是否违反约束
	 *
	 * @param issue - 待检测的 issue
	 * @param constraints - 架构约束列表
	 * @returns 违反的约束项，或 null
	 */
	private checkConstraintViolation(
		issue: DiscoveredIssue,
		constraints: string[],
	): string | null {
		// 检查是否违反明确的技术约束
		for (const constraint of constraints) {
			if (this.detectsViolation(issue, constraint)) {
				return constraint;
			}
		}

		return null;
	}

	/**
	 * 检查是否影响核心目标
	 *
	 * @param issue - 待检测的 issue
	 * @param goal - Mission 目标
	 * @returns 是否影响目标
	 */
	private checkGoalImpact(issue: DiscoveredIssue, _goal: string): boolean {
		// 简化版：检查 issue 是否提议改变核心功能
		const impactKeywords = ["改为", "替换", "取消", "不实现"];
		const issueText = `${issue.description} ${issue.suggestedFix || ""}`;

		return impactKeywords.some((keyword) => issueText.includes(keyword));
	}

	/**
	 * 关键词匹配
	 *
	 * @param text - 待匹配的文本
	 * @param pattern - 匹配模式
	 * @returns 是否匹配
	 */
	private matchesKeywords(text: string, pattern: string): boolean {
		const textLower = text.toLowerCase();
		const patternLower = pattern.toLowerCase();

		// 提取主要短语（去掉括号部分）
		// 例如："社交登录（Google/Facebook/Twitter）" -> "社交登录"
		const mainPhrase = patternLower.replace(/[（(][^)）]*[)）]/g, "").trim();

		// 首先检查主要短语
		if (mainPhrase && textLower.includes(mainPhrase)) {
			return true;
		}

		// 提取括号内的选项并检查
		const parenMatches = patternLower.matchAll(/[（(]([^)）]+)[)）]/g);
		for (const match of parenMatches) {
			const options = match[1].split("/");
			for (const option of options) {
				if (textLower.includes(option.trim())) {
					return true;
				}
			}
		}

		// 如果没有括号，检查整个pattern
		if (!patternLower.includes("(") && !patternLower.includes("（")) {
			return textLower.includes(patternLower);
		}

		return false;
	}

	/**
	 * 检测是否违反约束
	 *
	 * @param issue - 待检测的 issue
	 * @param constraint - 约束描述
	 * @returns 是否违反
	 */
	private detectsViolation(
		issue: DiscoveredIssue,
		_constraint: string,
	): boolean {
		// 检测是否提议违反约束
		// 例如：constraint = "必须使用 PostgreSQL"
		//       issue.suggestedFix = "改用 MongoDB"

		// 简化实现：关键词检测
		const violationPatterns = ["不用", "改用", "替换为", "换成"];
		const issueText = issue.suggestedFix || issue.description;

		return violationPatterns.some((pattern) => issueText.includes(pattern));
	}
}
