import type { DiscoveredIssue } from "../types/handoff.js";
import type {
	ActionSuggestion,
	ClassifiedIssues,
	IssuesAction,
} from "./types.js";

/**
 * 问题分类器
 *
 * 根据 ADR-0003 §6 的三种调整场景对 discoveredIssues 进行分类和决策
 */
export class IssuesClassifier {
	/**
	 * 按 severity 分类 issues
	 *
	 * @param issues - 待分类的 issues 列表
	 * @returns 按 severity 分类后的 issues
	 */
	classify(issues: DiscoveredIssue[]): ClassifiedIssues {
		return {
			blocking: issues.filter((i) => i.severity === "blocking"),
			warning: issues.filter((i) => i.severity === "warning"),
			info: issues.filter((i) => i.severity === "info"),
		};
	}

	/**
	 * 决定 action（基于 ADR-0003 §6 的三种场景）
	 *
	 * 场景 1: dependency_missing → auto_adjust
	 * 场景 2: architecture_conflict → pause
	 * 场景 3: assertion_infeasible → auto_adjust
	 *
	 * @param classified - 已分类的 issues
	 * @returns 决定的行动
	 */
	decideAction(classified: ClassifiedIssues): IssuesAction {
		// 场景 1: 依赖缺失 → auto_adjust
		const hasDependencyMissing = classified.blocking.some(
			(i) => i.category === "dependency_missing",
		);
		if (hasDependencyMissing) {
			return "auto_adjust";
		}

		// 场景 2: 架构假设错误 → pause
		const hasArchitectureConflict = classified.blocking.some(
			(i) => i.category === "architecture_conflict",
		);
		if (hasArchitectureConflict) {
			return "pause";
		}

		// 场景 3: 断言不可行 → auto_adjust（需要修正契约）
		const hasInfeasibleAssertion = classified.blocking.some(
			(i) => i.category === "assertion_infeasible",
		);
		if (hasInfeasibleAssertion) {
			return "auto_adjust";
		}

		// 无 blocking issues → continue
		if (classified.blocking.length === 0) {
			return "continue";
		}

		// 其他 blocking issues → pause（保守策略）
		return "pause";
	}

	/**
	 * 生成 action suggestions
	 *
	 * @param classified - 已分类的 issues
	 * @param action - 决定的行动
	 * @returns 行动建议列表
	 */
	generateSuggestions(
		classified: ClassifiedIssues,
		action: IssuesAction,
	): ActionSuggestion[] {
		const suggestions: ActionSuggestion[] = [];

		if (action === "auto_adjust") {
			// 依赖缺失 → 建议创建新 feature
			for (const issue of classified.blocking) {
				if (issue.category === "dependency_missing") {
					suggestions.push({
						type: "create_feature",
						description: `创建新 feature: ${issue.suggestedFix || issue.description}`,
						metadata: { originalIssueId: issue.id },
					});
				}

				// 断言不可行 → 建议更新断言
				if (issue.category === "assertion_infeasible") {
					suggestions.push({
						type: "update_assertion",
						description: `更新断言: ${issue.suggestedFix || issue.description}`,
						metadata: {
							originalIssueId: issue.id,
							affectedAssertions: issue.affectedAssertions || [],
						},
					});
				}
			}
		}

		if (action === "pause") {
			// 架构冲突 → 建议 send 信号
			for (const issue of classified.blocking) {
				if (issue.category === "architecture_conflict") {
					suggestions.push({
						type: "send_signal",
						description: `需要人工裁决: ${issue.description}`,
						metadata: { issueId: issue.id, severity: issue.severity },
					});
				}
			}

			// 其他 blocking issues 也需要人工介入
			for (const issue of classified.blocking) {
				if (
					issue.category !== "architecture_conflict" &&
					issue.category !== "dependency_missing" &&
					issue.category !== "assertion_infeasible"
				) {
					suggestions.push({
						type: "send_signal",
						description: `需要人工裁决: ${issue.description}`,
						metadata: { issueId: issue.id, severity: issue.severity },
					});
				}
			}
		}

		return suggestions;
	}
}
