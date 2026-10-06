import { describe, expect, it } from "vitest";
import { IssuesClassifier } from "../../src/orchestrator/issues-classifier.js";
import {
	mockBlockingArchitectureIssue,
	mockBlockingDependencyIssue,
	mockBlockingInfeasibleIssue,
	mockBlockingOtherIssue,
	mockBlockingScopeIssue,
	mockInfoIssue,
	mockWarningIssue,
} from "./fixtures/mock-issues.js";

describe("IssuesClassifier", () => {
	const classifier = new IssuesClassifier();

	describe("classify", () => {
		it("应该正确分类 blocking issues", () => {
			const issues = [
				mockBlockingDependencyIssue,
				mockBlockingArchitectureIssue,
				mockWarningIssue,
			];

			const result = classifier.classify(issues);

			expect(result.blocking).toHaveLength(2);
			expect(result.blocking).toContain(mockBlockingDependencyIssue);
			expect(result.blocking).toContain(mockBlockingArchitectureIssue);
			expect(result.warning).toHaveLength(1);
			expect(result.info).toHaveLength(0);
		});

		it("应该正确分类 warning issues", () => {
			const issues = [mockWarningIssue, mockBlockingDependencyIssue];

			const result = classifier.classify(issues);

			expect(result.warning).toHaveLength(1);
			expect(result.warning).toContain(mockWarningIssue);
			expect(result.blocking).toHaveLength(1);
		});

		it("应该正确分类 info issues", () => {
			const issues = [mockInfoIssue, mockWarningIssue];

			const result = classifier.classify(issues);

			expect(result.info).toHaveLength(1);
			expect(result.info).toContain(mockInfoIssue);
			expect(result.warning).toHaveLength(1);
		});

		it("应该处理空 issues 列表", () => {
			const result = classifier.classify([]);

			expect(result.blocking).toHaveLength(0);
			expect(result.warning).toHaveLength(0);
			expect(result.info).toHaveLength(0);
		});

		it("应该处理混合 severity 的 issues", () => {
			const issues = [
				mockBlockingDependencyIssue,
				mockWarningIssue,
				mockInfoIssue,
				mockBlockingArchitectureIssue,
			];

			const result = classifier.classify(issues);

			expect(result.blocking).toHaveLength(2);
			expect(result.warning).toHaveLength(1);
			expect(result.info).toHaveLength(1);
		});
	});

	describe("decideAction", () => {
		it("场景1：dependency_missing 应该返回 auto_adjust", () => {
			const classified = {
				blocking: [mockBlockingDependencyIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("auto_adjust");
		});

		it("场景2：architecture_conflict 应该返回 pause", () => {
			const classified = {
				blocking: [mockBlockingArchitectureIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("pause");
		});

		it("场景3：assertion_infeasible 应该返回 auto_adjust", () => {
			const classified = {
				blocking: [mockBlockingInfeasibleIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("auto_adjust");
		});

		it("无 blocking issues 应该返回 continue", () => {
			const classified = {
				blocking: [],
				warning: [mockWarningIssue],
				info: [mockInfoIssue],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("continue");
		});

		it("其他 blocking issues 应该返回 pause（保守策略）", () => {
			const classified = {
				blocking: [mockBlockingScopeIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("pause");
		});

		it("dependency_missing 优先级高于 architecture_conflict", () => {
			const classified = {
				blocking: [mockBlockingDependencyIssue, mockBlockingArchitectureIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("auto_adjust");
		});

		it("architecture_conflict 优先级高于 assertion_infeasible", () => {
			const classified = {
				blocking: [mockBlockingArchitectureIssue, mockBlockingInfeasibleIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("pause");
		});

		it("assertion_infeasible 优先级高于 other", () => {
			const classified = {
				blocking: [mockBlockingInfeasibleIssue, mockBlockingOtherIssue],
				warning: [],
				info: [],
			};

			const action = classifier.decideAction(classified);

			expect(action).toBe("auto_adjust");
		});
	});

	describe("generateSuggestions", () => {
		it("auto_adjust + dependency_missing 应该生成 create_feature 建议", () => {
			const classified = {
				blocking: [mockBlockingDependencyIssue],
				warning: [],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(
				classified,
				"auto_adjust",
			);

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].type).toBe("create_feature");
			expect(suggestions[0].description).toContain("创建新 feature");
			expect(suggestions[0].metadata?.originalIssueId).toBe("ISSUE-001");
		});

		it("auto_adjust + assertion_infeasible 应该生成 update_assertion 建议", () => {
			const classified = {
				blocking: [mockBlockingInfeasibleIssue],
				warning: [],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(
				classified,
				"auto_adjust",
			);

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].type).toBe("update_assertion");
			expect(suggestions[0].description).toContain("更新断言");
			expect(suggestions[0].metadata?.originalIssueId).toBe("ISSUE-003");
			expect(suggestions[0].metadata?.affectedAssertions).toEqual(["VAL-002"]);
		});

		it("pause + architecture_conflict 应该生成 send_signal 建议", () => {
			const classified = {
				blocking: [mockBlockingArchitectureIssue],
				warning: [],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(classified, "pause");

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].type).toBe("send_signal");
			expect(suggestions[0].description).toContain("需要人工裁决");
			expect(suggestions[0].metadata?.issueId).toBe("ISSUE-002");
			expect(suggestions[0].metadata?.severity).toBe("blocking");
		});

		it("pause + other 应该生成 send_signal 建议", () => {
			const classified = {
				blocking: [mockBlockingOtherIssue],
				warning: [],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(classified, "pause");

			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].type).toBe("send_signal");
			expect(suggestions[0].description).toContain("需要人工裁决");
		});

		it("continue 应该不生成 suggestions", () => {
			const classified = {
				blocking: [],
				warning: [mockWarningIssue],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(
				classified,
				"continue",
			);

			expect(suggestions).toHaveLength(0);
		});

		it("auto_adjust + 多个 issues 应该生成多个 suggestions", () => {
			const classified = {
				blocking: [mockBlockingDependencyIssue, mockBlockingInfeasibleIssue],
				warning: [],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(
				classified,
				"auto_adjust",
			);

			expect(suggestions).toHaveLength(2);
			expect(suggestions[0].type).toBe("create_feature");
			expect(suggestions[1].type).toBe("update_assertion");
		});

		it("pause + 多个 issues 应该生成多个 send_signal 建议", () => {
			const classified = {
				blocking: [mockBlockingArchitectureIssue, mockBlockingScopeIssue],
				warning: [],
				info: [],
			};

			const suggestions = classifier.generateSuggestions(classified, "pause");

			expect(suggestions).toHaveLength(2);
			expect(suggestions.every((s) => s.type === "send_signal")).toBe(true);
		});
	});
});
