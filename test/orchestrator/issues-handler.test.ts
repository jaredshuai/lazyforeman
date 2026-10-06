import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import { DiscoveredIssuesRepository } from "../../src/discovered-issues/repository.js";
import { IssuesClassifier } from "../../src/orchestrator/issues-classifier.js";
import { DefaultIssuesHandler } from "../../src/orchestrator/issues-handler.js";
import {
	mockBlockingArchitectureIssue,
	mockBlockingDependencyIssue,
	mockBlockingInfeasibleIssue,
	mockInfoIssue,
	mockWarningIssue,
} from "./fixtures/mock-issues.js";

describe("DefaultIssuesHandler", () => {
	let db: SqliteDb;
	let repository: DiscoveredIssuesRepository;
	let classifier: IssuesClassifier;
	let handler: DefaultIssuesHandler;

	/**
	 * 创建必要的 mission、feature 和 handoff 记录以满足外键约束
	 */
	function setupTestData(
		featureId: string,
		handoffId: string,
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

		// 创建 handoff
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

	beforeEach(() => {
		db = openDatabase(":memory:");
		repository = new DiscoveredIssuesRepository(db);
		classifier = new IssuesClassifier();
		// Create mock dependencies with null/minimal implementations for testing
		const visionDetector = null; // Vision detector is optional
		const planAdjuster = {
			handleDependencyMissing: async () => ({
				action: "feature_created" as const,
				reasoning: "Mock adjustment",
			}),
			handleArchitectureConflict: async () => ({
				action: "no_action_needed" as const,
				reasoning: "Mock adjustment",
			}),
			handleInfeasibleAssertion: async () => ({
				action: "assertion_modified" as const,
				reasoning: "Mock adjustment for infeasible assertion",
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

	describe("handle", () => {
		it("应该处理无 issues 场景（action: continue）", async () => {
			const result = await handler.handle("feat-001", "handoff-001");

			expect(result.action).toBe("continue");
			expect(result.issues.blocking).toHaveLength(0);
			expect(result.issues.warning).toHaveLength(0);
			expect(result.issues.info).toHaveLength(0);
			expect(result.suggestions).toHaveLength(0);
		});

		it("应该处理 blocking dependency_missing 场景", async () => {
			setupTestData("feat-001", "handoff-001");
			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);

			const result = await handler.handle("feat-001", "handoff-001");

			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.issues.blocking[0].category).toBe("dependency_missing");
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("create_feature");
		});

		it("应该处理 blocking architecture_conflict 场景", async () => {
			setupTestData("feat-002", "handoff-002");
			repository.saveAll(
				[mockBlockingArchitectureIssue],
				"handoff-002",
				"feat-002",
			);

			const result = await handler.handle("feat-002", "handoff-002");

			expect(result.action).toBe("pause");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.issues.blocking[0].category).toBe("architecture_conflict");
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("send_signal");
		});

		it("应该处理 blocking assertion_infeasible 场景", async () => {
			setupTestData("feat-003", "handoff-003");
			repository.saveAll(
				[mockBlockingInfeasibleIssue],
				"handoff-003",
				"feat-003",
			);

			const result = await handler.handle("feat-003", "handoff-003");

			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.issues.blocking[0].category).toBe("assertion_infeasible");
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("update_assertion");
		});

		it("应该正确分类 warning 和 info issues", async () => {
			setupTestData("feat-004", "handoff-004");
			repository.saveAll(
				[mockWarningIssue, mockInfoIssue],
				"handoff-004",
				"feat-004",
			);

			const result = await handler.handle("feat-004", "handoff-004");

			expect(result.action).toBe("continue");
			expect(result.issues.blocking).toHaveLength(0);
			expect(result.issues.warning).toHaveLength(1);
			expect(result.issues.info).toHaveLength(1);
			expect(result.suggestions).toHaveLength(0);
		});

		it("应该处理混合 severity 的 issues", async () => {
			setupTestData("feat-005", "handoff-005");
			repository.saveAll(
				[mockBlockingDependencyIssue, mockWarningIssue, mockInfoIssue],
				"handoff-005",
				"feat-005",
			);

			const result = await handler.handle("feat-005", "handoff-005");

			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.issues.warning).toHaveLength(1);
			expect(result.issues.info).toHaveLength(1);
		});

		it("应该处理多个 blocking issues", async () => {
			setupTestData("feat-006", "handoff-006");
			repository.saveAll(
				[mockBlockingDependencyIssue, mockBlockingInfeasibleIssue],
				"handoff-006",
				"feat-006",
			);

			const result = await handler.handle("feat-006", "handoff-006");

			expect(result.action).toBe("auto_adjust");
			expect(result.issues.blocking).toHaveLength(2);
			expect(result.suggestions).toHaveLength(2);
		});

		it("应该只返回指定 handoff 的 issues", async () => {
			// 保存两个 handoff 的 issues
			setupTestData("feat-007", "handoff-007");
			setupTestData("feat-008", "handoff-008");
			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-007",
				"feat-007",
			);
			repository.saveAll(
				[mockBlockingArchitectureIssue],
				"handoff-008",
				"feat-008",
			);

			// 查询第一个 handoff
			const result = await handler.handle("feat-007", "handoff-007");

			expect(result.issues.blocking).toHaveLength(1);
			expect(result.issues.blocking[0].id).toBe("ISSUE-001");
		});
	});
});
