/**
 * Phase 2.2 End-to-End Integration Tests
 *
 * Tests complete scenarios from Grill to execution to discoveredIssues
 * to dynamic adjustment to recovery.
 *
 * Validates:
 * - VAL-014: At least 2 end-to-end integration tests
 * - Complete workflow: Grill → Mission → Execute → Issues → Adjust → Validate
 */

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { DiscoveredIssuesRepository } from "../../src/discovered-issues/repository.js";
import { IssuesClassifier } from "../../src/orchestrator/issues-classifier.js";
import { DefaultIssuesHandler } from "../../src/orchestrator/issues-handler.js";
import { DefaultPlanAdjuster } from "../../src/orchestrator/plan-adjuster.js";
import { DefaultVisionConflictDetector } from "../../src/orchestrator/vision-conflict-detector.js";
import { SqliteStepJournal } from "../../src/runtime/step-journal.js";
import type { WorkflowContext } from "../../src/runtime/workflow-runner.js";
import { DefaultSignalManager } from "../../src/signals/manager.js";
import type { Assertion } from "../../src/types/assertion.js";
import type { Feature } from "../../src/types/feature.js";
import type { DiscoveredIssue } from "../../src/types/handoff.js";
import {
	executeMissionWorkflow,
	type MissionWorkflowConfig,
} from "../../src/workflows/mission.js";

describe("Phase 2.2 End-to-End Integration", () => {
	let db: SqliteDb;
	let journal: SqliteStepJournal;
	let outputDir: string;
	let signalManager: DefaultSignalManager;
	let issuesRepo: DiscoveredIssuesRepository;

	const validMissionMarkdown = `
# Mission: User Authentication System

## 背景
- 背景句子 1：应用需要用户认证功能
- 背景句子 2：需要与现有后端系统集成
- 背景句子 3：确保安全性和用户体验

## 目标
实现完整的用户登录和注册功能

## 边界
✅ 做：实现登录界面
✅ 做：实现注册流程
✅ 做：集成认证 API
❌ 不做：实现社交登录
❌ 不做：实现双因素认证

## 成功标准
- 用户可以成功注册账户
- 用户可以使用邮箱和密码登录
- 错误提示清晰易懂
- 界面响应时间 < 1 秒

## 架构约束
- 使用 JWT 进行身份验证
- 密码必须加密存储
- 遵循 OWASP 安全最佳实践

## 风险
⚠️ API 集成可能遇到兼容性问题
⚠️ 密码安全要求可能影响性能
`;

	beforeEach(async () => {
		db = openDatabase(":memory:");
		journal = new SqliteStepJournal(db);
		signalManager = new DefaultSignalManager(db);
		issuesRepo = new DiscoveredIssuesRepository(db);

		// Create unique temp output directory
		const randomId = randomBytes(8).toString("hex");
		outputDir = join(tmpdir(), `e2e-test-${randomId}`);
		await mkdir(outputDir, { recursive: true });
	});

	afterEach(async () => {
		db.close();
		await rm(outputDir, { recursive: true, force: true });
	});

	describe("Scenario 1: Dependency Missing → Auto-Adjust", () => {
		it("should handle dependency_missing and create new feature", async () => {
			// Step 1: Run mission workflow to generate assertions and features
			const missionId = "e2e-test-001";
			const config: MissionWorkflowConfig = {
				missionId,
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "e2e-scenario-1",
				journal,
			};

			const missionResult = await executeMissionWorkflow(ctx, db, config);

			expect(missionResult.features.length).toBeGreaterThan(0);
			expect(missionResult.assertions.length).toBeGreaterThan(0);

			// Step 2: Simulate worker execution with dependency_missing issue
			const targetFeature = missionResult.features[0];
			const handoffId = `handoff-${Date.now()}`;

			// Create handoff record (prerequisite for discovered_issues foreign key)
			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoffId,
				targetFeature.id,
				JSON.stringify({ summary: "Test handoff" }),
				new Date().toISOString(),
			);

			const discoveredIssues: DiscoveredIssue[] = [
				{
					id: `issue-${Date.now()}-1`,
					category: "dependency_missing",
					severity: "blocking",
					description: "需要先实现 API 客户端模块才能集成认证",
					context: "实现登录功能时发现缺少 API 客户端模块",
					discoveredAt: new Date().toISOString(),
					affectedAssertions: [targetFeature.fulfills[0]],
					suggestedFix: "创建 API 客户端模块，包含认证相关的 HTTP 请求封装",
				},
			];

			issuesRepo.saveAll(discoveredIssues, handoffId, targetFeature.id);

			// Step 3: Use IssuesHandler to process the issue
			const issuesHandler = new DefaultIssuesHandler(
				issuesRepo,
				new IssuesClassifier(),
				new DefaultVisionConflictDetector(),
				new DefaultPlanAdjuster(signalManager, db),
				db,
			);

			const handling = await issuesHandler.handle(targetFeature.id, handoffId, {
				missionDocument: {
					name: "User Authentication System",
					background: ["应用需要用户认证功能"],
					goal: "实现完整的用户登录和注册功能",
					boundaries: {
						inScope: ["实现登录界面", "实现注册流程"],
						outOfScope: ["社交登录"],
					},
					successCriteria: [],
					architectureConstraints: ["使用 JWT 进行身份验证"],
					risks: [],
					rawMarkdown: "",
				},
			});

			// Step 4: Verify auto-adjustment happened
			expect(handling.action).toBe("auto_adjust");
			expect(handling.suggestions).toBeDefined();
			expect(handling.suggestions.length).toBeGreaterThan(0);
			expect(handling.suggestions[0].type).toBe("create_feature");

			// Step 5: Verify new feature was created in database
			const allFeatures = db
				.prepare<unknown[], Feature>(
					"SELECT * FROM features WHERE mission_id = ? ORDER BY id",
				)
				.all(missionId);

			expect(allFeatures.length).toBe(missionResult.features.length + 1);

			const newFeature = allFeatures[allFeatures.length - 1];
			expect(newFeature.name).toContain("API 客户端");

			// Step 6: Verify original feature's preconditions updated
			const updatedFeature = db
				.prepare<[string], Feature>("SELECT * FROM features WHERE id = ?")
				.get(targetFeature.id);

			expect(updatedFeature).toBeDefined();
			expect(updatedFeature?.preconditions).toContain(newFeature.id);
		});

		it("should handle multiple dependency_missing issues", async () => {
			// Step 1: Run mission workflow
			const missionId = "e2e-test-002";
			const config: MissionWorkflowConfig = {
				missionId,
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "e2e-scenario-1-multi",
				journal,
			};

			const missionResult = await executeMissionWorkflow(ctx, db, config);
			const targetFeature = missionResult.features[0];
			const handoffId = `handoff-${Date.now()}`;

			// Create handoff record
			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoffId,
				targetFeature.id,
				JSON.stringify({ summary: "Test handoff" }),
				new Date().toISOString(),
			);

			// Step 2: Multiple dependency issues
			const discoveredIssues: DiscoveredIssue[] = [
				{
					id: `issue-${Date.now()}-1`,
					category: "dependency_missing",
					severity: "blocking",
					description: "需要先实现 API 客户端模块",
					context: "实现登录功能时发现缺少 API 客户端",
					discoveredAt: new Date().toISOString(),
					affectedAssertions: [targetFeature.fulfills[0]],
					suggestedFix: "创建 API 客户端模块",
				},
				{
					id: `issue-${Date.now()}-2`,
					category: "dependency_missing",
					severity: "blocking",
					description: "需要先实现加密工具模块",
					context: "密码处理时发现缺少加密工具",
					discoveredAt: new Date().toISOString(),
					affectedAssertions: [targetFeature.fulfills[0]],
					suggestedFix: "创建密码加密工具模块",
				},
			];

			issuesRepo.saveAll(discoveredIssues, handoffId, targetFeature.id);

			// Step 3: Process issues
			const issuesHandler = new DefaultIssuesHandler(
				issuesRepo,
				new IssuesClassifier(),
				new DefaultVisionConflictDetector(),
				new DefaultPlanAdjuster(signalManager, db),
				db,
			);

			const handling = await issuesHandler.handle(targetFeature.id, handoffId, {
				missionDocument: {
					name: "User Authentication System",
					background: ["应用需要用户认证功能"],
					goal: "实现完整的用户登录和注册功能",
					boundaries: {
						inScope: ["实现登录界面"],
						outOfScope: ["社交登录"],
					},
					successCriteria: [],
					architectureConstraints: ["使用 JWT", "密码必须加密"],
					risks: [],
					rawMarkdown: "",
				},
			});

			// Step 4: Verify both features created
			expect(handling.action).toBe("auto_adjust");
			expect(handling.suggestions).toBeDefined();
			expect(handling.suggestions.length).toBe(2);
			expect(
				handling.suggestions.every((s) => s.type === "create_feature"),
			).toBe(true);

			const allFeatures = db
				.prepare<unknown[], Feature>(
					"SELECT * FROM features WHERE mission_id = ? ORDER BY id",
				)
				.all(missionId);

			expect(allFeatures.length).toBe(missionResult.features.length + 2);
		});
	});

	describe("Scenario 2: Architecture Conflict → Signal → Pause", () => {
		it("should pause execution and send signal for architecture conflict", async () => {
			// Step 1: Run mission workflow
			const missionId = "e2e-test-003";
			const config: MissionWorkflowConfig = {
				missionId,
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "e2e-scenario-2",
				journal,
			};

			const missionResult = await executeMissionWorkflow(ctx, db, config);
			const targetFeature = missionResult.features[0];
			const handoffId = `handoff-${Date.now()}`;

			// Create handoff record
			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoffId,
				targetFeature.id,
				JSON.stringify({ summary: "Test handoff" }),
				new Date().toISOString(),
			);

			// Step 2: Simulate architecture conflict
			const discoveredIssues: DiscoveredIssue[] = [
				{
					id: `issue-${Date.now()}-1`,
					category: "architecture_conflict",
					severity: "blocking",
					description: "现有代码库使用 OAuth2，与 mission.md 中要求的 JWT 冲突",
					context: "检查现有认证实现时发现架构冲突",
					discoveredAt: new Date().toISOString(),
					affectedAssertions: [targetFeature.fulfills[0]],
				},
			];

			issuesRepo.saveAll(discoveredIssues, handoffId, targetFeature.id);

			// Step 3: Process issue - should pause
			const issuesHandler = new DefaultIssuesHandler(
				issuesRepo,
				new IssuesClassifier(),
				new DefaultVisionConflictDetector(),
				new DefaultPlanAdjuster(signalManager, db),
				db,
			);

			const handling = await issuesHandler.handle(targetFeature.id, handoffId, {
				missionDocument: {
					name: "User Authentication System",
					background: ["应用需要用户认证功能"],
					goal: "实现完整的用户登录和注册功能",
					boundaries: {
						inScope: ["实现登录界面"],
						outOfScope: [],
					},
					successCriteria: [],
					architectureConstraints: ["使用 JWT 进行身份验证"],
					risks: [],
					rawMarkdown: "",
				},
			});

			// Step 4: Verify signal sent and workflow paused
			expect(handling.action).toBe("pause");
			expect(handling.suggestions).toBeDefined();
			expect(handling.suggestions.length).toBeGreaterThan(0);
			expect(handling.suggestions[0].type).toBe("send_signal");

			// Step 5: Verify signal exists in database
			const signalId = handling.suggestions[0].metadata?.signalId as string;
			expect(signalId).toBeDefined();

			const signal = db
				.prepare("SELECT * FROM signals WHERE id = ?")
				.get(signalId);

			expect(signal).toBeDefined();
			expect(signal).toMatchObject({
				type: "architecture_conflict",
				status: "pending",
			});
		});
	});

	describe("Scenario 3: Infeasible Assertion → Modify → Revalidate", () => {
		it("should handle infeasible assertion and update plan", async () => {
			// Step 1: Run mission workflow
			const missionId = "e2e-test-004";
			const config: MissionWorkflowConfig = {
				missionId,
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "e2e-scenario-3",
				journal,
			};

			const missionResult = await executeMissionWorkflow(ctx, db, config);
			const targetFeature = missionResult.features[0];
			const handoffId = `handoff-${Date.now()}`;

			// Create handoff record
			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoffId,
				targetFeature.id,
				JSON.stringify({ summary: "Test handoff" }),
				new Date().toISOString(),
			);

			// Step 2: Simulate infeasible assertion
			const infeasibleAssertionId = targetFeature.fulfills[0];

			const discoveredIssues: DiscoveredIssue[] = [
				{
					id: `issue-${Date.now()}-1`,
					category: "assertion_infeasible",
					severity: "blocking",
					description: "API 不支持该功能，无法实现此断言",
					context: "调研 API 文档后发现该功能不可行",
					discoveredAt: new Date().toISOString(),
					affectedAssertions: [infeasibleAssertionId],
					suggestedFix: "移除此断言或修改为可行的替代方案",
				},
			];

			issuesRepo.saveAll(discoveredIssues, handoffId, targetFeature.id);

			// Step 3: Process issue
			const issuesHandler = new DefaultIssuesHandler(
				issuesRepo,
				new IssuesClassifier(),
				new DefaultVisionConflictDetector(),
				new DefaultPlanAdjuster(signalManager, db),
				db,
			);

			const handling = await issuesHandler.handle(targetFeature.id, handoffId, {
				missionDocument: {
					name: "User Authentication System",
					background: ["应用需要用户认证功能"],
					goal: "实现完整的用户登录和注册功能",
					boundaries: {
						inScope: ["实现登录界面"],
						outOfScope: [],
					},
					successCriteria: [],
					architectureConstraints: ["使用 JWT"],
					risks: [],
					rawMarkdown: "",
				},
			});

			// Step 4: Verify assertion marked as infeasible
			expect(handling.action).toBe("auto_adjust");

			const assertion = db
				.prepare<[string], Assertion>("SELECT * FROM assertions WHERE id = ?")
				.get(infeasibleAssertionId);

			expect(assertion).toBeDefined();
			expect(assertion?.status).toBe("infeasible");

			// Step 5: Verify feature updated to remove infeasible assertion
			const updatedFeature = db
				.prepare<[string], Feature>("SELECT * FROM features WHERE id = ?")
				.get(targetFeature.id);

			expect(updatedFeature).toBeDefined();
			expect(updatedFeature?.fulfills).not.toContain(infeasibleAssertionId);
		});
	});
});
