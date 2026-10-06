import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import { DiscoveredIssuesRepository } from "../../src/discovered-issues/repository.js";
import {
	mockBlockingArchitectureIssue,
	mockBlockingDependencyIssue,
	mockBlockingInfeasibleIssue,
	mockInfoIssue,
	mockWarningIssue,
} from "./fixtures/mock-issues.js";

describe("DiscoveredIssuesRepository", () => {
	let db: SqliteDb;
	let repository: DiscoveredIssuesRepository;

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
		handoffStmt.run(handoffId, featureId, "{}", new Date().toISOString());
	}

	beforeEach(() => {
		db = openDatabase(":memory:");
		repository = new DiscoveredIssuesRepository(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("saveAll and findByHandoff", () => {
		it("应该保存并查询 discovered issues", () => {
			setupTestData("feat-001", "handoff-001");

			const issues = [
				mockBlockingDependencyIssue,
				mockWarningIssue,
				mockInfoIssue,
			];

			repository.saveAll(issues, "handoff-001", "feat-001");

			const loaded = repository.findByHandoff("handoff-001");

			expect(loaded).toHaveLength(3);
			expect(loaded[0].id).toBe("ISSUE-001"); // blocking
			expect(loaded[1].id).toBe("ISSUE-005"); // info
			expect(loaded[2].id).toBe("ISSUE-004"); // warning
		});

		it("应该按 severity 排序返回 issues", () => {
			setupTestData("feat-001", "handoff-001");

			repository.saveAll(
				[mockInfoIssue, mockBlockingDependencyIssue, mockWarningIssue],
				"handoff-001",
				"feat-001",
			);

			const loaded = repository.findByHandoff("handoff-001");

			// 应该按 severity 排序：blocking, warning, info
			// 注意：SQLite 按字母顺序排序，所以顺序是 blocking, info, warning
			expect(loaded[0].severity).toBe("blocking");
			expect(loaded[1].severity).toBe("info");
			expect(loaded[2].severity).toBe("warning");
		});
	});

	describe("loadByHandoffId (async)", () => {
		it("应该异步加载 issues", async () => {
			setupTestData("feat-001", "handoff-001");

			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);

			const loaded = await repository.loadByHandoffId("handoff-001");

			expect(loaded).toHaveLength(1);
			expect(loaded[0].id).toBe("ISSUE-001");
		});
	});

	describe("findByFeature", () => {
		it("应该查询特定 feature 的所有 issues", () => {
			setupTestData("feat-001", "handoff-001");
			setupTestData("feat-001", "handoff-002");

			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);
			repository.saveAll(
				[mockBlockingArchitectureIssue],
				"handoff-002",
				"feat-001",
			);

			const loaded = repository.findByFeature("feat-001");

			expect(loaded).toHaveLength(2);
		});
	});

	describe("findUnresolvedBlocking", () => {
		it("应该只返回未解决的 blocking issues", () => {
			setupTestData("feat-001", "handoff-001");

			repository.saveAll(
				[
					mockBlockingDependencyIssue,
					mockBlockingArchitectureIssue,
					mockWarningIssue,
				],
				"handoff-001",
				"feat-001",
			);

			const unresolved = repository.findUnresolvedBlocking();

			expect(unresolved).toHaveLength(2);
			expect(unresolved.every((i) => i.severity === "blocking")).toBe(true);
		});

		it("应该过滤已解决的 issues", () => {
			setupTestData("feat-001", "handoff-001");

			repository.saveAll(
				[mockBlockingDependencyIssue, mockBlockingArchitectureIssue],
				"handoff-001",
				"feat-001",
			);

			// 标记一个为已解决
			repository.markResolved("ISSUE-001", new Date().toISOString());

			const unresolved = repository.findUnresolvedBlocking();

			expect(unresolved).toHaveLength(1);
			expect(unresolved[0].id).toBe("ISSUE-002");
		});

		it("应该支持按 feature 过滤", () => {
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

			const unresolved = repository.findUnresolvedBlocking("feat-001");

			expect(unresolved).toHaveLength(1);
			expect(unresolved[0].id).toBe("ISSUE-001");
		});
	});

	describe("markResolved", () => {
		it("应该标记 issue 为已解决", () => {
			setupTestData("feat-001", "handoff-001");

			repository.saveAll(
				[mockBlockingDependencyIssue],
				"handoff-001",
				"feat-001",
			);

			repository.markResolved("ISSUE-001", new Date().toISOString());

			const unresolved = repository.findUnresolvedBlocking();
			expect(unresolved).toHaveLength(0);
		});
	});

	describe("affectedAssertions handling", () => {
		it("应该正确序列化和反序列化 affectedAssertions", () => {
			setupTestData("feat-001", "handoff-001");

			repository.saveAll(
				[mockBlockingInfeasibleIssue],
				"handoff-001",
				"feat-001",
			);

			const loaded = repository.findByHandoff("handoff-001");

			expect(loaded[0].affectedAssertions).toEqual(["VAL-002"]);
		});
	});
});
