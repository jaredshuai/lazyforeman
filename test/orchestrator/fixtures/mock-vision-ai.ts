import type { ConflictDetectionResult } from "../../../src/orchestrator/types.js";

/**
 * Mock AI 响应（用于测试）
 */
export const mockVisionAIResponses: Record<string, ConflictDetectionResult> = {
	// 重大冲突示例
	majorConflict: {
		conflictLevel: "major",
		reasoning:
			"提议的改动违反了明确的边界：用户明确表示不做社交登录，但 issue 建议添加 OAuth",
		recommendation: "require_user_decision",
	},

	// 轻微冲突示例
	minorConflict: {
		conflictLevel: "minor",
		reasoning: "改动调整了加密算法选择，但不影响安全存储密码的核心目标",
		recommendation: "multi_ai_adjudication",
	},

	// 无冲突示例
	noConflict: {
		conflictLevel: "none",
		reasoning: "技术调整（添加索引），不影响用户愿景",
		recommendation: "auto_approve",
	},
};
