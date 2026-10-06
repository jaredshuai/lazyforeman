import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import { DiscoveredIssuesRepository } from "../../src/discovered-issues/repository.js";
import { HandoffSchema } from "../../src/types/handoff.js";
import {
	mockHandoffWithIssues,
	mockHandoffWithMultipleIssues,
	mockHandoffWithoutIssues,
} from "./fixtures/mock-handoffs.js";
import type { SqliteDb } from "../../src/db/connection.js";

describe("DiscoveredIssues Integration", () => {
	let db: SqliteDb;
	let repository: DiscoveredIssuesRepository;

	beforeEach(() => {
		// Create in-memory database for tests with schema applied
		db = openDatabase(":memory:");

		// Create test data prerequisites
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run(
			"mission-001",
			"Test Mission",
			"in_progress",
			"2024-01-15T10:00:00.000Z",
			"2024-01-15T10:00:00.000Z",
		);

		db.prepare(
			"INSERT INTO features (id, mission_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run(
			"feat-001",
			"mission-001",
			"Test Feature 1",
			"in_progress",
			"2024-01-15T10:00:00.000Z",
			"2024-01-15T10:00:00.000Z",
		);

		db.prepare(
			"INSERT INTO features (id, mission_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run(
			"feat-002",
			"mission-001",
			"Test Feature 2",
			"in_progress",
			"2024-01-15T10:00:00.000Z",
			"2024-01-15T10:00:00.000Z",
		);

		db.prepare(
			"INSERT INTO features (id, mission_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run(
			"feat-003",
			"mission-001",
			"Test Feature 3",
			"in_progress",
			"2024-01-15T10:00:00.000Z",
			"2024-01-15T10:00:00.000Z",
		);

		repository = new DiscoveredIssuesRepository(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("End-to-end: Worker returns handoff with discoveredIssues", () => {
		it("should validate, save, and query handoff with issues", () => {
			// 1. Worker 返回 Handoff（带 discoveredIssues）
			const handoff = mockHandoffWithIssues;

			// 2. 验证 Handoff schema
			const validationResult = HandoffSchema.safeParse(handoff);
			expect(validationResult.success).toBe(true);

			if (!validationResult.success) {
				throw new Error("Handoff validation failed");
			}

			// 3. 保存 Handoff 到数据库（模拟实际保存逻辑）
			const saveHandoffStmt = db.prepare(`
        INSERT INTO handoffs (id, feature_id, content, created_at, discovered_issues_json)
        VALUES (?, ?, ?, ?, ?)
      `);

			saveHandoffStmt.run(
				handoff.id,
				handoff.featureId,
				JSON.stringify(handoff),
				handoff.createdAt,
				JSON.stringify(handoff.discoveredIssues || []),
			);

			// 4. 如果有 discoveredIssues，保存到专用表
			if (handoff.discoveredIssues && handoff.discoveredIssues.length > 0) {
				repository.saveAll(
					handoff.discoveredIssues,
					handoff.id,
					handoff.featureId,
				);
			}

			// 5. 验证保存成功 - 查询 handoffs 表
			const savedHandoff = db
				.prepare("SELECT * FROM handoffs WHERE id = ?")
				.get(handoff.id) as {
				id: string;
				feature_id: string;
				content: string;
				discovered_issues_json: string;
			};

			expect(savedHandoff).toBeDefined();
			expect(savedHandoff.feature_id).toBe("feat-001");
			expect(JSON.parse(savedHandoff.discovered_issues_json)).toHaveLength(2);

			// 6. 验证保存成功 - 查询 discovered_issues 表
			const issues = repository.findByFeature("feat-001");
			expect(issues).toHaveLength(2);
			expect(issues.some((i) => i.id === "ISSUE-001")).toBe(true);
			expect(issues.some((i) => i.id === "ISSUE-002")).toBe(true);

			// 7. 验证 blocking issues 查询
			const blockingIssues = repository.findUnresolvedBlocking();
			expect(blockingIssues).toHaveLength(1);
			expect(blockingIssues[0].id).toBe("ISSUE-001");
			expect(blockingIssues[0].severity).toBe("blocking");
		});

		it("should handle handoff without discoveredIssues (backward compatibility)", () => {
			const handoff = mockHandoffWithoutIssues;

			// Validate
			const validationResult = HandoffSchema.safeParse(handoff);
			expect(validationResult.success).toBe(true);

			// Save handoff
			const saveHandoffStmt = db.prepare(`
        INSERT INTO handoffs (id, feature_id, content, created_at, discovered_issues_json)
        VALUES (?, ?, ?, ?, ?)
      `);

			saveHandoffStmt.run(
				handoff.id,
				handoff.featureId,
				JSON.stringify(handoff),
				handoff.createdAt,
				null, // No discoveredIssues
			);

			// Verify no issues saved
			const issues = repository.findByFeature("feat-002");
			expect(issues).toHaveLength(0);
		});

		it("should handle handoff with multiple diverse issues", () => {
			const handoff = mockHandoffWithMultipleIssues;

			// Validate
			const validationResult = HandoffSchema.safeParse(handoff);
			expect(validationResult.success).toBe(true);

			if (!validationResult.success) {
				throw new Error("Handoff validation failed");
			}

			// Save
			const saveHandoffStmt = db.prepare(`
        INSERT INTO handoffs (id, feature_id, content, created_at, discovered_issues_json)
        VALUES (?, ?, ?, ?, ?)
      `);

			saveHandoffStmt.run(
				handoff.id,
				handoff.featureId,
				JSON.stringify(handoff),
				handoff.createdAt,
				JSON.stringify(handoff.discoveredIssues || []),
			);

			if (handoff.discoveredIssues && handoff.discoveredIssues.length > 0) {
				repository.saveAll(
					handoff.discoveredIssues,
					handoff.id,
					handoff.featureId,
				);
			}

			// Verify all issues saved
			const issues = repository.findByFeature("feat-003");
			expect(issues).toHaveLength(4);

			// Verify severity distribution
			const severities = issues.map((i) => i.severity);
			expect(severities.filter((s) => s === "blocking")).toHaveLength(2);
			expect(severities.filter((s) => s === "warning")).toHaveLength(1);
			expect(severities.filter((s) => s === "info")).toHaveLength(1);

			// Verify category distribution
			const categories = issues.map((i) => i.category);
			expect(categories).toContain("dependency_missing");
			expect(categories).toContain("assertion_infeasible");
			expect(categories).toContain("scope_ambiguity");
			expect(categories).toContain("technical_constraint");

			// Verify blocking issues
			const blockingIssues = repository.findUnresolvedBlocking();
			expect(blockingIssues).toHaveLength(2);

			// Verify summary
			const summary = repository.getUnresolvedSummary();
			expect(summary.blocking).toBe(2);
			expect(summary.warning).toBe(1);
			expect(summary.info).toBe(1);
		});
	});

	describe("Query scenarios", () => {
		beforeEach(() => {
			// Set up multiple handoffs with issues
			const handoff1 = mockHandoffWithIssues;
			const handoff3 = mockHandoffWithMultipleIssues;

			// Save handoff 1
			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoff1.id,
				handoff1.featureId,
				JSON.stringify(handoff1),
				handoff1.createdAt,
			);

			if (handoff1.discoveredIssues) {
				repository.saveAll(
					handoff1.discoveredIssues,
					handoff1.id,
					handoff1.featureId,
				);
			}

			// Save handoff 3
			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoff3.id,
				handoff3.featureId,
				JSON.stringify(handoff3),
				handoff3.createdAt,
			);

			if (handoff3.discoveredIssues) {
				repository.saveAll(
					handoff3.discoveredIssues,
					handoff3.id,
					handoff3.featureId,
				);
			}
		});

		it("should find issues by specific handoff", () => {
			const issues = repository.findByHandoff("handoff-test-001");
			expect(issues).toHaveLength(2);
			expect(issues.every((i) => i.id.startsWith("ISSUE-"))).toBe(true);
		});

		it("should find all blocking issues across features", () => {
			const blockingIssues = repository.findUnresolvedBlocking();
			// feat-001 has 1 blocking (ISSUE-001), feat-003 has 2 blocking (ISSUE-101, ISSUE-102)
			expect(blockingIssues.length).toBe(3);
			expect(blockingIssues.every((i) => i.severity === "blocking")).toBe(true);
		});

		it("should get accurate summary across all features", () => {
			const summary = repository.getUnresolvedSummary();

			// Total: feat-001 (1 blocking, 1 warning) + feat-003 (2 blocking, 1 warning, 1 info)
			expect(summary.blocking).toBe(3);
			expect(summary.warning).toBe(2);
			expect(summary.info).toBe(1);
		});

		it("should update summary when issues are resolved", () => {
			const beforeSummary = repository.getUnresolvedSummary();
			expect(beforeSummary.blocking).toBe(3);

			// Resolve one blocking issue
			const blockingIssues = repository.findUnresolvedBlocking();
			repository.markResolved(blockingIssues[0].id, new Date().toISOString());

			const afterSummary = repository.getUnresolvedSummary();
			expect(afterSummary.blocking).toBe(2);
		});
	});

	describe("Edge cases", () => {
		it("should handle empty discoveredIssues array", () => {
			const handoff = {
				...mockHandoffWithoutIssues,
				discoveredIssues: [],
			};

			const validationResult = HandoffSchema.safeParse(handoff);
			expect(validationResult.success).toBe(true);

			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoff.id,
				handoff.featureId,
				JSON.stringify(handoff),
				handoff.createdAt,
			);

			if (handoff.discoveredIssues && handoff.discoveredIssues.length > 0) {
				repository.saveAll(
					handoff.discoveredIssues,
					handoff.id,
					handoff.featureId,
				);
			}

			const issues = repository.findByFeature(handoff.featureId);
			expect(issues).toHaveLength(0);
		});

		it("should handle issue with all optional fields populated", () => {
			const handoff = mockHandoffWithIssues;

			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoff.id,
				handoff.featureId,
				JSON.stringify(handoff),
				handoff.createdAt,
			);

			if (handoff.discoveredIssues) {
				repository.saveAll(
					handoff.discoveredIssues,
					handoff.id,
					handoff.featureId,
				);
			}

			const issues = repository.findByFeature(handoff.featureId);
			const issue = issues.find((i) => i.id === "ISSUE-001");

			expect(issue?.suggestedFix).toBeDefined();
			expect(issue?.affectedAssertions).toBeDefined();
			expect(issue?.affectedAssertions?.length).toBeGreaterThan(0);
		});

		it("should handle issue with no optional fields", () => {
			const handoff = mockHandoffWithMultipleIssues;

			db.prepare(
				"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
			).run(
				handoff.id,
				handoff.featureId,
				JSON.stringify(handoff),
				handoff.createdAt,
			);

			if (handoff.discoveredIssues) {
				repository.saveAll(
					handoff.discoveredIssues,
					handoff.id,
					handoff.featureId,
				);
			}

			const issues = repository.findByFeature(handoff.featureId);
			// ISSUE-101 in mockHandoffWithMultipleIssues has no affectedAssertions
			const issueWithoutOptionals = issues.find((i) => i.id === "ISSUE-101");

			expect(issueWithoutOptionals).toBeDefined();
			expect(issueWithoutOptionals?.suggestedFix).toBeDefined();
		});
	});
});
