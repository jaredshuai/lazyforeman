import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import { DiscoveredIssuesRepository } from "../../src/discovered-issues/repository.js";
import type { DiscoveredIssue } from "../../src/types/handoff.js";
import type { SqliteDb } from "../../src/db/connection.js";

describe("DiscoveredIssuesRepository", () => {
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
			"Test Feature",
			"in_progress",
			"2024-01-15T10:00:00.000Z",
			"2024-01-15T10:00:00.000Z",
		);

		db.prepare(
			"INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)",
		).run(
			"handoff-001",
			"feat-001",
			JSON.stringify({}),
			"2024-01-15T10:00:00.000Z",
		);

		repository = new DiscoveredIssuesRepository(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("save", () => {
		it("should save single issue to database", () => {
			const issue: DiscoveredIssue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Backend API endpoint missing",
				context:
					"Attempting to implement login form but /api/v1/login does not exist",
				suggestedFix: "Implement POST /api/v1/login endpoint first",
				affectedAssertions: ["VAL-001", "VAL-002"],
				discoveredAt: "2024-01-15T10:30:00.000Z",
			};

			repository.save(issue, "handoff-001", "feat-001");

			const result = db
				.prepare("SELECT * FROM discovered_issues WHERE id = ?")
				.get("ISSUE-001") as {
				id: string;
				handoff_id: string;
				feature_id: string;
				severity: string;
				category: string;
				description: string;
				context: string;
				suggested_fix: string;
				affected_assertions_json: string;
				discovered_at: string;
			};

			expect(result).toBeDefined();
			expect(result.id).toBe("ISSUE-001");
			expect(result.handoff_id).toBe("handoff-001");
			expect(result.feature_id).toBe("feat-001");
			expect(result.severity).toBe("blocking");
			expect(result.category).toBe("dependency_missing");
			expect(result.description).toBe("Backend API endpoint missing");
			expect(result.suggested_fix).toBe(
				"Implement POST /api/v1/login endpoint first",
			);
			expect(JSON.parse(result.affected_assertions_json)).toEqual([
				"VAL-001",
				"VAL-002",
			]);
		});

		it("should handle issue without optional fields", () => {
			const issue: DiscoveredIssue = {
				id: "ISSUE-001",
				severity: "info",
				category: "other",
				description: "Consider using React Query for data fetching",
				context: "Current implementation uses manual fetch calls",
				discoveredAt: "2024-01-15T10:30:00.000Z",
			};

			repository.save(issue, "handoff-001", "feat-001");

			const result = db
				.prepare("SELECT * FROM discovered_issues WHERE id = ?")
				.get("ISSUE-001") as {
				suggested_fix: string | null;
				affected_assertions_json: string | null;
			};

			expect(result.suggested_fix).toBeNull();
			expect(result.affected_assertions_json).toBeNull();
		});
	});

	describe("saveAll", () => {
		it("should save multiple issues in batch", () => {
			const issues: DiscoveredIssue[] = [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Backend API endpoint missing",
					context: "Login form implementation blocked",
					discoveredAt: "2024-01-15T10:30:00.000Z",
				},
				{
					id: "ISSUE-002",
					severity: "warning",
					category: "architecture_conflict",
					description: "JWT algorithm mismatch",
					context: "mission.md requires HS256 but system uses RS256",
					discoveredAt: "2024-01-15T10:45:00.000Z",
				},
			];

			repository.saveAll(issues, "handoff-001", "feat-001");

			const count = db
				.prepare("SELECT COUNT(*) as count FROM discovered_issues")
				.get() as { count: number };

			expect(count.count).toBe(2);
		});

		it("should save empty issues array without error", () => {
			repository.saveAll([], "handoff-001", "feat-001");

			const count = db
				.prepare("SELECT COUNT(*) as count FROM discovered_issues")
				.get() as { count: number };

			expect(count.count).toBe(0);
		});
	});

	describe("findByFeature", () => {
		beforeEach(() => {
			const issues: DiscoveredIssue[] = [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Issue 1",
					context: "Context 1",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-002",
					severity: "warning",
					category: "architecture_conflict",
					description: "Issue 2",
					context: "Context 2",
					discoveredAt: "2024-01-15T11:00:00.000Z",
				},
			];

			repository.saveAll(issues, "handoff-001", "feat-001");
		});

		it("should find all issues for a feature", () => {
			const issues = repository.findByFeature("feat-001");

			expect(issues).toHaveLength(2);
			expect(issues.some((i) => i.id === "ISSUE-001")).toBe(true);
			expect(issues.some((i) => i.id === "ISSUE-002")).toBe(true);
		});

		it("should return empty array for feature with no issues", () => {
			const issues = repository.findByFeature("feat-999");

			expect(issues).toHaveLength(0);
		});

		it("should return issues with correct structure", () => {
			const issues = repository.findByFeature("feat-001");
			const issue = issues.find((i) => i.id === "ISSUE-001");

			expect(issue).toBeDefined();
			expect(issue?.id).toBe("ISSUE-001");
			expect(issue?.severity).toBe("blocking");
			expect(issue?.category).toBe("dependency_missing");
			expect(issue?.description).toBe("Issue 1");
			expect(issue?.context).toBe("Context 1");
			expect(issue?.discoveredAt).toBe("2024-01-15T10:00:00.000Z");
		});
	});

	describe("findByHandoff", () => {
		beforeEach(() => {
			const issues: DiscoveredIssue[] = [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Issue 1",
					context: "Context 1",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-002",
					severity: "warning",
					category: "architecture_conflict",
					description: "Issue 2",
					context: "Context 2",
					discoveredAt: "2024-01-15T11:00:00.000Z",
				},
			];

			repository.saveAll(issues, "handoff-001", "feat-001");
		});

		it("should find all issues for a handoff", () => {
			const issues = repository.findByHandoff("handoff-001");

			expect(issues).toHaveLength(2);
			expect(issues.some((i) => i.id === "ISSUE-001")).toBe(true);
			expect(issues.some((i) => i.id === "ISSUE-002")).toBe(true);
		});

		it("should return empty array for handoff with no issues", () => {
			const issues = repository.findByHandoff("handoff-999");

			expect(issues).toHaveLength(0);
		});
	});

	describe("findUnresolvedBlocking", () => {
		beforeEach(() => {
			const issues: DiscoveredIssue[] = [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Blocking issue 1",
					context: "Context 1",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-002",
					severity: "blocking",
					category: "assertion_infeasible",
					description: "Blocking issue 2",
					context: "Context 2",
					discoveredAt: "2024-01-15T11:00:00.000Z",
				},
				{
					id: "ISSUE-003",
					severity: "warning",
					category: "scope_ambiguity",
					description: "Warning issue",
					context: "Context 3",
					discoveredAt: "2024-01-15T12:00:00.000Z",
				},
			];

			repository.saveAll(issues, "handoff-001", "feat-001");
		});

		it("should find only blocking unresolved issues", () => {
			const issues = repository.findUnresolvedBlocking();

			expect(issues).toHaveLength(2);
			expect(issues.every((i) => i.severity === "blocking")).toBe(true);
		});

		it("should find blocking issues for specific feature", () => {
			const issues = repository.findUnresolvedBlocking("feat-001");

			expect(issues).toHaveLength(2);
			expect(issues.every((i) => i.severity === "blocking")).toBe(true);
		});

		it("should exclude resolved blocking issues", () => {
			repository.markResolved("ISSUE-001", new Date().toISOString());

			const issues = repository.findUnresolvedBlocking();

			expect(issues).toHaveLength(1);
			expect(issues[0].id).toBe("ISSUE-002");
		});

		it("should return empty array when all blocking issues are resolved", () => {
			repository.markResolved("ISSUE-001", new Date().toISOString());
			repository.markResolved("ISSUE-002", new Date().toISOString());

			const issues = repository.findUnresolvedBlocking();

			expect(issues).toHaveLength(0);
		});
	});

	describe("markResolved", () => {
		beforeEach(() => {
			const issue: DiscoveredIssue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Test issue",
				context: "Test context",
				discoveredAt: "2024-01-15T10:00:00.000Z",
			};

			repository.save(issue, "handoff-001", "feat-001");
		});

		it("should mark issue as resolved", () => {
			const resolvedAt = new Date().toISOString();
			repository.markResolved("ISSUE-001", resolvedAt);

			const result = db
				.prepare(
					"SELECT resolved, resolved_at FROM discovered_issues WHERE id = ?",
				)
				.get("ISSUE-001") as { resolved: number; resolved_at: string };

			expect(result.resolved).toBe(1);
			expect(result.resolved_at).toBe(resolvedAt);
		});
	});

	describe("getUnresolvedSummary", () => {
		it("should return summary of unresolved issues by severity", () => {
			const issues: DiscoveredIssue[] = [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Blocking 1",
					context: "Context 1",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-002",
					severity: "blocking",
					category: "dependency_missing",
					description: "Blocking 2",
					context: "Context 2",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-003",
					severity: "warning",
					category: "architecture_conflict",
					description: "Warning 1",
					context: "Context 3",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-004",
					severity: "info",
					category: "other",
					description: "Info 1",
					context: "Context 4",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
			];

			repository.saveAll(issues, "handoff-001", "feat-001");

			const summary = repository.getUnresolvedSummary();

			expect(summary.blocking).toBe(2);
			expect(summary.warning).toBe(1);
			expect(summary.info).toBe(1);
		});

		it("should return zero counts when no issues exist", () => {
			const summary = repository.getUnresolvedSummary();

			expect(summary.blocking).toBe(0);
			expect(summary.warning).toBe(0);
			expect(summary.info).toBe(0);
		});

		it("should exclude resolved issues from summary", () => {
			const issues: DiscoveredIssue[] = [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Blocking 1",
					context: "Context 1",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
				{
					id: "ISSUE-002",
					severity: "blocking",
					category: "dependency_missing",
					description: "Blocking 2",
					context: "Context 2",
					discoveredAt: "2024-01-15T10:00:00.000Z",
				},
			];

			repository.saveAll(issues, "handoff-001", "feat-001");
			repository.markResolved("ISSUE-001", new Date().toISOString());

			const summary = repository.getUnresolvedSummary();

			expect(summary.blocking).toBe(1);
		});
	});
});
