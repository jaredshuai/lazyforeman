/**
 * Vision Conflict Detector Unit Tests
 *
 * Tests for the vision conflict detection mechanism (feat-005)
 * Based on ADR-0003 §6.2 conflict detection standards
 */

import { describe, it, expect } from "vitest";
import { DefaultVisionConflictDetector } from "../../src/orchestrator/vision-conflict-detector.js";
import {
	mockIssueViolatesBoundary,
	mockIssueViolatesConstraint,
	mockIssueMinorConflict,
	mockIssueNoConflict,
} from "./fixtures/mock-issues.js";
import { mockMissionDocument } from "./fixtures/mock-mission.js";
import type { VisionContext } from "../../src/orchestrator/types.js";

describe("DefaultVisionConflictDetector", () => {
	const detector = new DefaultVisionConflictDetector();

	const visionContext: VisionContext = {
		missionDocument: mockMissionDocument,
	};

	describe("重大冲突检测 - 违反边界", () => {
		it("应该检测到违反 outOfScope 边界的提议", async () => {
			const result = await detector.detect(
				mockIssueViolatesBoundary,
				visionContext,
			);

			expect(result.conflictLevel).toBe("major");
			expect(result.reasoning).toContain("违反了明确的边界约束");
			expect(result.reasoning).toContain("社交登录");
			expect(result.recommendation).toBe("require_user_decision");
		});

		it("应该在 suggestedFix 和 description 中都检测边界冲突", async () => {
			const issueInDescription = {
				...mockIssueViolatesBoundary,
				suggestedFix: undefined,
				description: "建议添加社交登录功能以提升用户体验",
			};

			const result = await detector.detect(issueInDescription, visionContext);

			expect(result.conflictLevel).toBe("major");
			expect(result.reasoning).toContain("违反了明确的边界约束");
		});
	});

	describe("重大冲突检测 - 违反架构约束", () => {
		it("应该检测到违反架构约束的提议", async () => {
			const result = await detector.detect(
				mockIssueViolatesConstraint,
				visionContext,
			);

			expect(result.conflictLevel).toBe("major");
			expect(result.reasoning).toContain("违反了架构约束");
			expect(result.reasoning).toContain("必须使用 PostgreSQL");
			expect(result.recommendation).toBe("require_user_decision");
		});

		it("应该检测多种违反模式（不用/改用/替换为/换成）", async () => {
			const patterns = [
				{ fix: "不用 PostgreSQL", word: "不用" },
				{ fix: "改用 MongoDB", word: "改用" },
				{ fix: "替换为 MySQL", word: "替换为" },
				{ fix: "换成 Redis", word: "换成" },
			];

			for (const pattern of patterns) {
				const issue = {
					...mockIssueViolatesConstraint,
					suggestedFix: pattern.fix,
				};

				const result = await detector.detect(issue, visionContext);

				expect(result.conflictLevel).toBe("major");
				expect(result.reasoning).toContain("违反了架构约束");
			}
		});
	});

	describe("轻微冲突检测 - 影响目标实现方式", () => {
		it("应该检测到可能影响目标的改动", async () => {
			const result = await detector.detect(
				mockIssueMinorConflict,
				visionContext,
			);

			expect(result.conflictLevel).toBe("minor");
			expect(result.reasoning).toContain("改动可能影响目标实现方式");
			expect(result.recommendation).toBe("multi_ai_adjudication");
		});

		it("应该识别关键词（改为/替换/取消/不实现）", async () => {
			const keywords = ["改为", "替换", "取消", "不实现"];

			for (const keyword of keywords) {
				const issue = {
					...mockIssueMinorConflict,
					description: `建议${keyword}当前的实现方案`,
				};

				const result = await detector.detect(issue, visionContext);

				expect(result.conflictLevel).toBe("minor");
			}
		});
	});

	describe("无冲突检测 - 技术调整", () => {
		it("应该识别无冲突的技术调整", async () => {
			const result = await detector.detect(mockIssueNoConflict, visionContext);

			expect(result.conflictLevel).toBe("none");
			expect(result.reasoning).toContain("技术调整，不影响用户愿景");
			expect(result.recommendation).toBe("auto_approve");
		});

		it("应该对性能优化判定为无冲突", async () => {
			const performanceIssue = {
				id: "ISSUE-014",
				severity: "warning" as const,
				category: "technical_constraint" as const,
				description: "查询性能可以优化",
				context: "添加缓存层",
				suggestedFix: "引入 Redis 缓存",
				discoveredAt: new Date().toISOString(),
			};

			const result = await detector.detect(performanceIssue, visionContext);

			expect(result.conflictLevel).toBe("none");
			expect(result.recommendation).toBe("auto_approve");
		});
	});

	describe("边界情况", () => {
		it("应该处理没有 suggestedFix 的 issue", async () => {
			const issueWithoutFix = {
				...mockIssueNoConflict,
				suggestedFix: undefined,
			};

			const result = await detector.detect(issueWithoutFix, visionContext);

			expect(result).toBeDefined();
			expect(result.conflictLevel).toBeDefined();
			expect(result.reasoning).toBeDefined();
			expect(result.recommendation).toBeDefined();
		});

		it("应该处理空的 outOfScope 列表", async () => {
			const contextWithEmptyBoundary: VisionContext = {
				missionDocument: {
					...mockMissionDocument,
					boundaries: {
						inScope: ["功能A"],
						outOfScope: [],
					},
				},
			};

			const result = await detector.detect(
				mockIssueViolatesBoundary,
				contextWithEmptyBoundary,
			);

			// 没有边界限制，不应该判定为违反边界
			expect(result.conflictLevel).not.toBe("major");
		});

		it("应该处理空的约束列表", async () => {
			const contextWithEmptyConstraints: VisionContext = {
				missionDocument: {
					...mockMissionDocument,
					architectureConstraints: [],
				},
			};

			const result = await detector.detect(
				mockIssueViolatesConstraint,
				contextWithEmptyConstraints,
			);

			// 没有约束，不应该判定为违反约束
			expect(result.conflictLevel).not.toBe("major");
		});
	});

	describe("优先级：边界 > 约束 > 目标", () => {
		it("边界冲突优先于约束冲突", async () => {
			const issueViolateBoth = {
				id: "ISSUE-015",
				severity: "blocking" as const,
				category: "scope_ambiguity" as const,
				description: "建议添加社交登录并改用 MongoDB",
				context: "同时违反边界和约束",
				suggestedFix: "实现 OAuth 2.0 社交登录并改用 MongoDB",
				discoveredAt: new Date().toISOString(),
			};

			const result = await detector.detect(issueViolateBoth, visionContext);

			expect(result.conflictLevel).toBe("major");
			expect(result.reasoning).toContain("违反了明确的边界约束");
		});

		it("约束冲突优先于目标影响", async () => {
			const issueViolateConstraintAndGoal = {
				id: "ISSUE-016",
				severity: "blocking" as const,
				category: "technical_constraint" as const,
				description: "建议改用 MongoDB 替换现有实现",
				context: "既违反约束又影响目标",
				suggestedFix: "改用 MongoDB",
				discoveredAt: new Date().toISOString(),
			};

			const result = await detector.detect(
				issueViolateConstraintAndGoal,
				visionContext,
			);

			expect(result.conflictLevel).toBe("major");
			expect(result.reasoning).toContain("违反了架构约束");
		});
	});

	describe("recommendation 逻辑", () => {
		it("重大冲突应该建议 require_user_decision", async () => {
			const result = await detector.detect(
				mockIssueViolatesBoundary,
				visionContext,
			);

			expect(result.conflictLevel).toBe("major");
			expect(result.recommendation).toBe("require_user_decision");
		});

		it("轻微冲突应该建议 multi_ai_adjudication", async () => {
			const result = await detector.detect(
				mockIssueMinorConflict,
				visionContext,
			);

			expect(result.conflictLevel).toBe("minor");
			expect(result.recommendation).toBe("multi_ai_adjudication");
		});

		it("无冲突应该建议 auto_approve", async () => {
			const result = await detector.detect(mockIssueNoConflict, visionContext);

			expect(result.conflictLevel).toBe("none");
			expect(result.recommendation).toBe("auto_approve");
		});
	});
});
