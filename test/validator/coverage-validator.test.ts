import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SqliteDb } from "../../src/db/connection.js";
import { openDatabase } from "../../src/db/connection.js";
import {
	createCoverageValidator,
	type CoverageValidator,
} from "../../src/validator/coverage-validator.js";
import type { Assertion } from "../../src/types/assertion.js";
import type { Feature } from "../../src/types/feature.js";

describe("Coverage Validator", () => {
	let db: SqliteDb;
	let validator: CoverageValidator;

	beforeEach(() => {
		db = openDatabase(":memory:");
		validator = createCoverageValidator(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("validate", () => {
		it("should pass when all assertions are claimed exactly once", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001"]),
				createFeature("feat-002", ["VAL-002", "VAL-003"]),
			];

			const result = validator.validate(assertions, features);

			expect(result.passed).toBe(true);
			expect(result.totalAssertions).toBe(3);
			expect(result.claimedAssertions).toBe(3);
			expect(result.coveragePercentage).toBe(100);
			expect(result.orphanAssertions).toHaveLength(0);
			expect(result.duplicateClaims.size).toBe(0);
		});

		it("should detect orphan assertions", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001"]),
				// VAL-002 and VAL-003 are not claimed
			];

			const result = validator.validate(assertions, features);

			expect(result.passed).toBe(false);
			expect(result.totalAssertions).toBe(3);
			expect(result.claimedAssertions).toBe(1);
			expect(result.orphanAssertions).toHaveLength(2);
			expect(result.orphanAssertions).toContain("VAL-002");
			expect(result.orphanAssertions).toContain("VAL-003");
		});

		it("should detect duplicate claims", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001"]),
				createFeature("feat-002", ["VAL-001"]), // Duplicate claim
				createFeature("feat-003", ["VAL-002"]),
			];

			const result = validator.validate(assertions, features);

			expect(result.passed).toBe(false);
			expect(result.totalAssertions).toBe(2);
			expect(result.duplicateClaims.size).toBe(1);
			expect(result.duplicateClaims.get("VAL-001")).toEqual([
				"feat-001",
				"feat-002",
			]);
		});

		it("should calculate coverage percentage correctly", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
				createAssertion("VAL-004"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001", "VAL-002"]),
				// VAL-003 and VAL-004 are orphans
			];

			const result = validator.validate(assertions, features);

			expect(result.coveragePercentage).toBe(50); // 2 out of 4
		});

		it("should handle empty assertions and features", () => {
			const result = validator.validate([], []);

			expect(result.passed).toBe(false); // No assertions to validate
			expect(result.totalAssertions).toBe(0);
			expect(result.claimedAssertions).toBe(0);
			expect(result.coveragePercentage).toBe(0);
		});

		it("should handle features with no fulfills field", () => {
			const assertions: Assertion[] = [createAssertion("VAL-001")];

			const features: Feature[] = [
				{
					...createFeature("feat-001", []),
					fulfills: undefined as unknown as string[],
				},
			];

			const result = validator.validate(assertions, features);

			expect(result.orphanAssertions).toContain("VAL-001");
		});

		it("should handle features with empty fulfills array", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
			];

			const features: Feature[] = [
				createFeature("feat-001", []),
				createFeature("feat-002", ["VAL-001", "VAL-002"]),
			];

			const result = validator.validate(assertions, features);

			expect(result.passed).toBe(true);
			expect(result.claimedAssertions).toBe(2);
		});

		it("should detect multiple orphans and duplicates simultaneously", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
				createAssertion("VAL-004"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001"]),
				createFeature("feat-002", ["VAL-001"]), // Duplicate
				createFeature("feat-003", ["VAL-002"]),
				// VAL-003 and VAL-004 are orphans
			];

			const result = validator.validate(assertions, features);

			expect(result.passed).toBe(false);
			expect(result.orphanAssertions).toHaveLength(2);
			expect(result.orphanAssertions).toContain("VAL-003");
			expect(result.orphanAssertions).toContain("VAL-004");
			expect(result.duplicateClaims.size).toBe(1);
			expect(result.duplicateClaims.get("VAL-001")).toEqual([
				"feat-001",
				"feat-002",
			]);
		});

		it("should set validation type to pre_work", () => {
			const result = validator.validate([], []);
			expect(result.validationType).toBe("pre_work");
		});

		it("should set validatedAt timestamp", () => {
			const before = new Date().toISOString();
			const result = validator.validate([], []);
			const after = new Date().toISOString();

			expect(result.validatedAt).toBeTruthy();
			expect(result.validatedAt >= before).toBe(true);
			expect(result.validatedAt <= after).toBe(true);
		});
	});

	describe("saveValidationResult", () => {
		it("should save validation result to database", async () => {
			// Create mission first (foreign key requirement)
			createMission(db, "mission-001");

			const assertions: Assertion[] = [createAssertion("VAL-001")];
			const features: Feature[] = [createFeature("feat-001", ["VAL-001"])];

			const result = validator.validate(assertions, features);
			await validator.saveValidationResult("mission-001", result);

			const rows = db
				.prepare("SELECT * FROM coverage_validations WHERE mission_id = ?")
				.all("mission-001");

			expect(rows).toHaveLength(1);
			const row = rows[0] as Record<string, unknown>;
			expect(row.mission_id).toBe("mission-001");
			expect(row.validation_type).toBe("pre_work");
			expect(row.total_assertions).toBe(1);
			expect(row.claimed_assertions).toBe(1);
			expect(row.passed).toBe(1);
		});

		it("should serialize JSON fields correctly", async () => {
			// Create mission first (foreign key requirement)
			createMission(db, "mission-002");

			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001"]),
				createFeature("feat-002", ["VAL-001"]), // Duplicate
				// VAL-002 and VAL-003 are orphans
			];

			const result = validator.validate(assertions, features);
			await validator.saveValidationResult("mission-002", result);

			const row = db
				.prepare("SELECT * FROM coverage_validations WHERE mission_id = ?")
				.get("mission-002") as Record<string, unknown>;

			const orphanAssertions = JSON.parse(row.orphan_assertions_json as string);
			expect(orphanAssertions).toEqual(["VAL-002", "VAL-003"]);

			const duplicateClaims = JSON.parse(row.duplicate_claims_json as string);
			expect(duplicateClaims).toEqual([["VAL-001", ["feat-001", "feat-002"]]]);
		});

		it("should save multiple validation results for same mission", async () => {
			// Create mission first (foreign key requirement)
			createMission(db, "mission-003");

			const result1 = validator.validate(
				[createAssertion("VAL-001")],
				[createFeature("feat-001", ["VAL-001"])],
			);
			await validator.saveValidationResult("mission-003", result1);

			const result2 = validator.validate(
				[createAssertion("VAL-001"), createAssertion("VAL-002")],
				[createFeature("feat-001", ["VAL-001", "VAL-002"])],
			);
			await validator.saveValidationResult("mission-003", result2);

			const rows = db
				.prepare("SELECT * FROM coverage_validations WHERE mission_id = ?")
				.all("mission-003");

			expect(rows).toHaveLength(2);
		});
	});

	describe("generateReport", () => {
		it("should generate passing report with green checkmark", () => {
			const result = validator.validate(
				[createAssertion("VAL-001")],
				[createFeature("feat-001", ["VAL-001"])],
			);

			const report = validator.generateReport(result);

			expect(report).toContain("# Assertion Coverage Validation Report");
			expect(report).toContain("✅ Passed");
			expect(report).toContain("Coverage**: 100.0%");
			expect(report).toContain("## ✅ Conclusion");
			expect(report).toContain("Ready to start work");
		});

		it("should generate failing report with issues listed", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001"]),
				// VAL-002 is orphan
			];

			const result = validator.validate(assertions, features);
			const report = validator.generateReport(result);

			expect(report).toContain("❌ Failed");
			expect(report).toContain("## ❌ Conclusion");
			expect(report).toContain("Must fix before starting work");
		});

		it("should include orphan assertions in report", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
			];

			const features: Feature[] = [createFeature("feat-001", ["VAL-001"])];

			const result = validator.validate(assertions, features);
			const report = validator.generateReport(result);

			expect(report).toContain("⚠️ Orphan Assertions (2)");
			expect(report).toContain("`VAL-002`");
			expect(report).toContain("`VAL-003`");
			expect(report).toContain("Create or update features to claim");
		});

		it("should include duplicate claims in report", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001", "VAL-002"]),
				createFeature("feat-002", ["VAL-001"]), // Duplicate
			];

			const result = validator.validate(assertions, features);
			const report = validator.generateReport(result);

			expect(report).toContain("⚠️ Duplicate Claims (1)");
			expect(report).toContain("`VAL-001` claimed by 2 features");
			expect(report).toContain("`feat-001`");
			expect(report).toContain("`feat-002`");
			expect(report).toContain("Remove duplicate claims");
		});

		it("should include summary metrics", () => {
			const assertions: Assertion[] = [
				createAssertion("VAL-001"),
				createAssertion("VAL-002"),
				createAssertion("VAL-003"),
			];

			const features: Feature[] = [
				createFeature("feat-001", ["VAL-001", "VAL-002"]),
			];

			const result = validator.validate(assertions, features);
			const report = validator.generateReport(result);

			expect(report).toContain("**Total Assertions**: 3");
			expect(report).toContain("**Claimed**: 2");
			expect(report).toContain("**Coverage**: 66.7%");
		});

		it("should include validation timestamp", () => {
			const result = validator.validate([], []);
			const report = validator.generateReport(result);

			expect(report).toContain("**Validation Time**:");
			expect(report).toContain(result.validatedAt);
		});
	});
});

// Helper functions for test data creation

function createAssertion(id: string): Assertion {
	return {
		id,
		description: `Test assertion ${id}`,
		status: "pending",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function createFeature(id: string, fulfills: string[]): Feature {
	return {
		id,
		missionId: "mission-001",
		name: `Test feature ${id}`,
		description: `Test feature description ${id}`,
		status: "pending",
		fulfills,
		preconditions: [],
		currentWorkerSessionId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function createMission(db: SqliteDb, missionId: string): void {
	db.prepare(
		`INSERT INTO missions (id, name, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
	).run(
		missionId,
		`Test Mission ${missionId}`,
		"Test mission for validation",
		"pending",
		new Date().toISOString(),
		new Date().toISOString(),
	);
}
