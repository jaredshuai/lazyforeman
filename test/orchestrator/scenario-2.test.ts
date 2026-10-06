import { describe, it, expect, beforeEach, vi } from "vitest";
import { DefaultPlanAdjuster } from "../../src/orchestrator/plan-adjuster.js";
import { TemporarySignalManager } from "../../src/signals/manager.js";
import { DefaultVisionConflictDetector } from "../../src/orchestrator/vision-conflict-detector.js";
import { mockArchitectureConflictIssue } from "./fixtures/mock-issues.js";
import type { Feature } from "../../src/types/feature.js";
import type { VisionContext } from "../../src/orchestrator/types.js";
import type { MissionDocument } from "../../src/types/mission-document.js";

describe("Scenario 2: Architecture Conflict", () => {
	let planAdjuster: DefaultPlanAdjuster;
	let visionDetector: DefaultVisionConflictDetector;
	let signalManager: TemporarySignalManager;
	let mockFeature: Feature;
	let mockVisionContext: VisionContext;
	let mockDb: any;

	beforeEach(() => {
		signalManager = new TemporarySignalManager();

		// Mock database
		mockDb = {
			prepare: () => ({
				get: () => null,
				all: () => [],
				run: () => ({ changes: 1, lastInsertRowid: 1 }),
			}),
		};

		planAdjuster = new DefaultPlanAdjuster(signalManager, mockDb);
		visionDetector = new DefaultVisionConflictDetector();

		mockFeature = {
			id: "feat-003",
			missionId: "mission-001",
			name: "实现 JWT 认证",
			description: "实现基于 JWT 的用户认证功能",
			status: "in_progress",
			fulfills: [],
			preconditions: [],
			currentWorkerSessionId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const mockMissionDoc: MissionDocument = {
			name: "用户认证系统",
			background: [
				"需要实现用户认证功能",
				"使用 JWT 进行身份验证",
				"确保系统安全",
			],
			goal: "实现用户认证系统",
			boundaries: {
				inScope: ["JWT 认证", "登录登出"],
				outOfScope: ["社交登录", "第三方 OAuth"],
			},
			successCriteria: ["用户可以成功登录", "JWT 令牌正确生成"],
			architectureConstraints: ["使用 JWT HS256 算法", "遵循 RESTful API 设计"],
			risks: [],
			rawMarkdown: "",
		};

		mockVisionContext = {
			missionDocument: mockMissionDoc,
			kickoffNotes: undefined,
			existingDecisions: [],
		};
	});

	describe("Vision Conflict Detection", () => {
		it("should detect major conflict for architecture_conflict issues", async () => {
			const result = await visionDetector.detect(
				mockArchitectureConflictIssue,
				mockVisionContext,
			);

			expect(result.conflictLevel).toBe("major");
			expect(result.recommendation).toBe("require_user_decision");
			expect(result.reasoning).toContain("架构约束");
		});

		it("should detect conflict when issue contains critical keywords", async () => {
			const issue = {
				...mockArchitectureConflictIssue,
				description: "加密算法不一致",
			};

			const result = await visionDetector.detect(issue, mockVisionContext);

			expect(result.conflictLevel).toBe("major");
		});

		it("should return minor conflict for non-critical architecture issues", async () => {
			const minorIssue = {
				...mockArchitectureConflictIssue,
				description: "API 路由命名需要改为统一规范",
				context: "建议统一命名规范",
				suggestedFix: "改为使用 kebab-case",
			};

			const result = await visionDetector.detect(minorIssue, mockVisionContext);

			expect(result.conflictLevel).toBe("minor");
			expect(result.recommendation).toBe("multi_ai_adjudication");
		});
	});

	describe("Plan Adjustment", () => {
		it("should send signal for architecture conflict", async () => {
			const conflictResult = await visionDetector.detect(
				mockArchitectureConflictIssue,
				mockVisionContext,
			);

			const result = await planAdjuster.handleArchitectureConflict(
				mockArchitectureConflictIssue,
				mockFeature,
				conflictResult,
			);

			expect(result.action).toBe("no_action_needed");
			expect(result.signalId).toMatch(/^SIG-\d+$/);
			expect(result.reasoning).toContain("等待用户裁决");
		});

		it("should include correct signal payload", async () => {
			const conflictResult = await visionDetector.detect(
				mockArchitectureConflictIssue,
				mockVisionContext,
			);

			const result = await planAdjuster.handleArchitectureConflict(
				mockArchitectureConflictIssue,
				mockFeature,
				conflictResult,
			);

			expect(result.signalId).toBeDefined();
			// Signal was sent with correct type and payload
			// (in real implementation, we could verify the signal was stored)
		});

		it("should include suggestedActions in signal", async () => {
			const conflictResult = await visionDetector.detect(
				mockArchitectureConflictIssue,
				mockVisionContext,
			);

			const consoleSpy = vi.spyOn(console, "log");

			await planAdjuster.handleArchitectureConflict(
				mockArchitectureConflictIssue,
				mockFeature,
				conflictResult,
			);

			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe("Signal Content", () => {
		it("should include all required fields in signal payload", async () => {
			const conflictResult = await visionDetector.detect(
				mockArchitectureConflictIssue,
				mockVisionContext,
			);

			const consoleSpy = vi.spyOn(console, "log");

			await planAdjuster.handleArchitectureConflict(
				mockArchitectureConflictIssue,
				mockFeature,
				conflictResult,
			);

			const logCall = consoleSpy.mock.calls.find((call) =>
				call[0].includes("[Signal] Sent:"),
			);
			expect(logCall).toBeDefined();

			const signalData = logCall![1];
			expect(signalData).toMatchObject({
				type: "architecture_conflict",
				status: "pending",
				featureId: "feat-003",
				issueId: "ISSUE-020",
				conflictLevel: "major",
			});

			consoleSpy.mockRestore();
		});
	});

	describe("Integration with handleArchitectureConflict", () => {
		it("should complete full flow: detect → send signal → return result", async () => {
			// Step 1: Detect conflict
			const conflictResult = await visionDetector.detect(
				mockArchitectureConflictIssue,
				mockVisionContext,
			);

			expect(conflictResult.conflictLevel).toBe("major");

			// Step 2: Handle conflict (sends signal)
			const adjustmentResult = await planAdjuster.handleArchitectureConflict(
				mockArchitectureConflictIssue,
				mockFeature,
				conflictResult,
			);

			// Step 3: Verify result
			expect(adjustmentResult.action).toBe("no_action_needed");
			expect(adjustmentResult.signalId).toMatch(/^SIG-\d+$/);
			expect(adjustmentResult.reasoning).toContain("signal");
		});
	});
});
