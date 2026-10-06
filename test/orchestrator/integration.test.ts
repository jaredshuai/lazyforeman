import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import { DiscoveredIssuesRepository } from "../../src/discovered-issues/repository.js";
import { IssuesClassifier } from "../../src/orchestrator/issues-classifier.js";
import { DefaultIssuesHandler } from "../../src/orchestrator/issues-handler.js";
import type { Handoff } from "../../src/types/handoff.js";
import {
	mockBlockingArchitectureIssue,
	mockBlockingDependencyIssue,
	mockBlockingInfeasibleIssue,
	mockInfoIssue,
	mockWarningIssue,
} from "./fixtures/mock-issues.js";

describe("Orchestrator Issues Integration", () => {
	let db: SqliteDb;
	let repository: DiscoveredIssuesRepository;
	let handler: DefaultIssuesHandler;

	/**
	 * 创建必要的 mission、feature 和 handoff 记录以满足外键约束
	 */
	function setupTestData(
		featureId: string,
		handoffId?: string,
		missionId = "mission-001",
	): void {
		// 创建 mission
		const missionStmt = db.prepare(`
      INSERT OR IGNORE INTO missions (id, name, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
		missionStmt.run(
			missionId,
			"Test Mission",
			"Test Description",
			"in_progress",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		// 创建 feature
		const featureStmt = db.prepare(`
      INSERT OR IGNORE INTO features (id, mission_id, name, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
		featureStmt.run(
			featureId,
			missionId,
			"Test Feature",
			"Test Feature Description",
			"in_progress",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		// 如果提供了 handoffId，创建 handoff
		if (handoffId) {
			const handoffStmt = db.prepare(`
        INSERT OR IGNORE INTO handoffs (id, feature_id, content, created_at)
        VALUES (?, ?, ?, ?)
      `);
			handoffStmt.run(
				handoffId,
				featureId,
				"Test handoff content",
				new Date().toISOString(),
			);
		}
	}

	beforeEach(() => {
		db = openDatabase(":memory:");
		repository = new DiscoveredIssuesRepository(db);
		const classifier = new IssuesClassifier();
		// Create mock dependencies with null/minimal implementations for testing
		const visionDetector = null; // Vision detector is optional
		const planAdjuster = {
			handleDependencyMissing: async (issue: any) => ({
				action: "feature_created" as const,
				reasoning: issue.suggestedFix || issue.description,
			}),
			handleArchitectureConflict: async () => ({
				action: "no_action_needed" as const,
				reasoning: "Mock adjustment",
			}),
			handleInfeasibleAssertion: async (issue: any) => ({
				action: "assertion_modified" as const,
				reasoning: issue.suggestedFix || issue.description,
				modifiedAssertions: [],
			}),
		};
		handler = new DefaultIssuesHandler(
			repository,
			classifier,
			visionDetector,
			planAdjuster,
			db,
		);
	});

	afterEach(() => {
		db.close();
	});

	/**
	 * 模拟 Worker 返回 handoff with issues
	 */
	function simulateWorkerHandoff(handoff: Handoff): void {
		// 0. 确保 feature 存在
		setupTestData(handoff.featureId);

		// 1. 保存 handoff 到数据库
		const stmt = db.prepare(`
      INSERT INTO handoffs (id, feature_id, content, created_at)
      VALUES (?, ?, ?, ?)
    `);
		stmt.run(
			handoff.id,
			handoff.featureId,
			JSON.stringify(handoff),
			handoff.createdAt,
		);

		// 2. 保存 discoveredIssues 到 discovered_issues 表
		if (handoff.discoveredIssues && handoff.discoveredIssues.length > 0) {
			repository.saveAll(
				handoff.discoveredIssues,
				handoff.id,
				handoff.featureId,
			);
		}
	}

	describe("端到端测试：Worker 返回 handoff → IssuesHandler 处理", () => {
		it("场景1：依赖缺失 → auto_adjust + create_feature", async () => {
			// 1. Worker 返回 handoff with dependency_missing issue
			const handoff: Handoff = {
				id: "handoff-001",
				featureId: "feat-001",
				salientSummary: "实现登录表单",
				whatWasImplemented: ["创建登录组件", "添加表单验证"],
				whatWasLeftUndone: ["后端接口集成"],
				verification: {
					commandsRun: [],
					interactiveChecks: [],
				},
				tests: {
					added: [],
					coverage: "80%",
				},
				discoveredIssues: [mockBlockingDependencyIssue],
				skillFeedback: {
					followedProcedure: true,
					deviations: [],
					suggestedChanges: [],
				},
				createdAt: new Date().toISOString(),
			};

			simulateWorkerHandoff(handoff);

			// 2. IssuesHandler 处理
			const result = await handler.handle("feat-001", "handoff-001");

			// 3. 验证结果
			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("create_feature");
			expect(result.suggestions[0].description).toContain(
				"先实现 POST /api/v1/login",
			);
		});

		it("场景2：架构冲突 → pause + send_signal", async () => {
			// 1. Worker 返回 handoff with architecture_conflict issue
			const handoff: Handoff = {
				id: "handoff-002",
				featureId: "feat-002",
				salientSummary: "实现 JWT 验证",
				whatWasImplemented: ["创建 JWT 中间件"],
				whatWasLeftUndone: ["算法不匹配问题"],
				verification: {
					commandsRun: [],
					interactiveChecks: [],
				},
				tests: {
					added: [],
					coverage: "70%",
				},
				discoveredIssues: [mockBlockingArchitectureIssue],
				skillFeedback: {
					followedProcedure: true,
					deviations: [],
					suggestedChanges: [],
				},
				createdAt: new Date().toISOString(),
			};

			simulateWorkerHandoff(handoff);

			// 2. IssuesHandler 处理
			const result = await handler.handle("feat-002", "handoff-002");

			// 3. 验证结果
			expect(result.action).toBe("pause");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("send_signal");
			expect(result.suggestions[0].description).toContain("需要人工裁决");
		});

		it("场景3：断言不可行 → auto_adjust + update_assertion", async () => {
			// 1. Worker 返回 handoff with assertion_infeasible issue
			const handoff: Handoff = {
				id: "handoff-003",
				featureId: "feat-003",
				salientSummary: "实现密码错误提示",
				whatWasImplemented: ["错误处理逻辑"],
				whatWasLeftUndone: ["后端不支持详细错误码"],
				verification: {
					commandsRun: [],
					interactiveChecks: [],
				},
				tests: {
					added: [],
					coverage: "75%",
				},
				discoveredIssues: [mockBlockingInfeasibleIssue],
				skillFeedback: {
					followedProcedure: true,
					deviations: [],
					suggestedChanges: [],
				},
				createdAt: new Date().toISOString(),
			};

			simulateWorkerHandoff(handoff);

			// 2. IssuesHandler 处理
			const result = await handler.handle("feat-003", "handoff-003");

			// 3. 验证结果
			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("update_assertion");
			expect(result.suggestions[0].metadata?.affectedAssertions).toEqual([
				"VAL-002",
			]);
		});

		it("场景4：无 blocking issues → continue", async () => {
			// 1. Worker 返回 handoff with warning/info issues
			const handoff: Handoff = {
				id: "handoff-004",
				featureId: "feat-004",
				salientSummary: "实现用户列表",
				whatWasImplemented: ["用户列表组件", "分页功能"],
				whatWasLeftUndone: [],
				verification: {
					commandsRun: [],
					interactiveChecks: [],
				},
				tests: {
					added: [],
					coverage: "85%",
				},
				discoveredIssues: [mockWarningIssue, mockInfoIssue],
				skillFeedback: {
					followedProcedure: true,
					deviations: [],
					suggestedChanges: [],
				},
				createdAt: new Date().toISOString(),
			};

			simulateWorkerHandoff(handoff);

			// 2. IssuesHandler 处理
			const result = await handler.handle("feat-004", "handoff-004");

			// 3. 验证结果
			expect(result.action).toBe("continue");
			expect(result.issues.blocking).toHaveLength(0);
			expect(result.issues.warning).toHaveLength(1);
			expect(result.issues.info).toHaveLength(1);
			expect(result.suggestions).toHaveLength(0);
		});

		it("场景5：多个 blocking issues → 按优先级决策", async () => {
			// 1. Worker 返回 handoff with 多个 blocking issues
			const handoff: Handoff = {
				id: "handoff-005",
				featureId: "feat-005",
				salientSummary: "实现复杂功能",
				whatWasImplemented: ["部分功能"],
				whatWasLeftUndone: ["多个问题需要解决"],
				verification: {
					commandsRun: [],
					interactiveChecks: [],
				},
				tests: {
					added: [],
					coverage: "60%",
				},
				discoveredIssues: [
					mockBlockingDependencyIssue,
					mockBlockingArchitectureIssue,
					mockBlockingInfeasibleIssue,
					mockWarningIssue,
				],
				skillFeedback: {
					followedProcedure: true,
					deviations: [],
					suggestedChanges: [],
				},
				createdAt: new Date().toISOString(),
			};

			simulateWorkerHandoff(handoff);

			// 2. IssuesHandler 处理
			const result = await handler.handle("feat-005", "handoff-005");

			// 3. 验证结果
			// dependency_missing 优先级最高，应该返回 auto_adjust
			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(3);
			expect(result.issues.warning).toHaveLength(1);
			expect(result.suggestions.length).toBeGreaterThan(0);
		});
	});

	describe("Repository 查询功能", () => {
		it("应该能查询未解决的 blocking issues", () => {
			setupTestData("feat-001", "handoff-001");
			setupTestData("feat-002", "handoff-002");
			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);
			repository.saveAll([mockWarningIssue], "handoff-002", "feat-002");

			const unresolvedBlocking = repository.findUnresolvedBlocking();

			expect(unresolvedBlocking).toHaveLength(1);
			expect(unresolvedBlocking[0].severity).toBe("blocking");
		});

		it("应该能标记 issue 为已解决", () => {
			setupTestData("feat-001", "handoff-001");
			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);

			// 标记为已解决
			repository.markResolved("ISSUE-001", new Date().toISOString());

			const unresolvedBlocking = repository.findUnresolvedBlocking();
			expect(unresolvedBlocking).toHaveLength(0);
		});

		it("应该能按 feature 查询 issues", () => {
			setupTestData("feat-001", "handoff-001");
			setupTestData("feat-002", "handoff-002");
			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);
			repository.saveAll(
				[mockBlockingArchitectureIssue],
				"handoff-002",
				"feat-002",
			);

			const feat001Issues = repository.findByFeature("feat-001");

			expect(feat001Issues).toHaveLength(1);
			expect(feat001Issues[0].id).toBe("ISSUE-001");
		});
	});
});
