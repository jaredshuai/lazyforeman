import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SqliteDb } from "../../src/db/connection.js";
import { openDatabase } from "../../src/db/connection.js";
import { createCoverageValidator } from "../../src/validator/coverage-validator.js";
import type { Assertion } from "../../src/types/assertion.js";
import type { Feature } from "../../src/types/feature.js";

describe("Coverage Validator Integration", () => {
	let db: SqliteDb;

	beforeEach(() => {
		db = openDatabase(":memory:");
	});

	afterEach(() => {
		db.close();
	});

	it("should validate full mission workflow (mission → assertions → features → coverage)", async () => {
		// Simulate a mission with assertions and features
		const missionId = "mission-integration-001";

		// Insert mission
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			missionId,
			"Test Mission",
			"Integration test mission",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		// Insert assertions
		const assertions: Assertion[] = [
			{
				id: "VAL-001",
				description: "User can login",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "deterministic",
				sourceIndex: 0,
			},
			{
				id: "VAL-002",
				description: "Password is hashed",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "deterministic",
				sourceIndex: 1,
			},
			{
				id: "VAL-003",
				description: "Session persists",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "semantic",
				sourceIndex: 2,
			},
		];

		for (const assertion of assertions) {
			db.prepare(
				`INSERT INTO assertions (id, description, status, created_at, updated_at, mission_id, type, source_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				assertion.id,
				assertion.description,
				assertion.status,
				assertion.createdAt,
				assertion.updatedAt,
				assertion.missionId,
				assertion.type,
				assertion.sourceIndex,
			);
		}

		// Insert features
		const features: Feature[] = [
			{
				id: "feat-001",
				name: "Login API",
				description: "Implement login endpoint",
				status: "pending",
				fulfills: ["VAL-001", "VAL-002"],
				preconditions: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: "feat-002",
				name: "Session Management",
				description: "Implement session storage",
				status: "pending",
				fulfills: ["VAL-003"],
				preconditions: ["feat-001"],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		for (const feature of features) {
			db.prepare(
				`INSERT INTO features (id, mission_id, name, description, status, fulfills, preconditions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				feature.id,
				missionId,
				feature.name,
				feature.description,
				feature.status,
				JSON.stringify(feature.fulfills),
				JSON.stringify(feature.preconditions),
				feature.createdAt,
				feature.updatedAt,
			);
		}

		// Validate coverage
		const validator = createCoverageValidator(db);
		const result = validator.validate(assertions, features);

		// Assertions
		expect(result.passed).toBe(true);
		expect(result.totalAssertions).toBe(3);
		expect(result.claimedAssertions).toBe(3);
		expect(result.coveragePercentage).toBe(100);

		// Save result
		await validator.saveValidationResult(missionId, result);

		// Verify saved
		const savedResult = db
			.prepare(
				"SELECT * FROM coverage_validations WHERE mission_id = ? ORDER BY id DESC LIMIT 1",
			)
			.get(missionId) as Record<string, unknown>;

		expect(savedResult).toBeTruthy();
		expect(savedResult.passed).toBe(1);
		expect(savedResult.total_assertions).toBe(3);

		// Generate report
		const report = validator.generateReport(result);
		expect(report).toContain("✅ Passed");
		expect(report).toContain("100.0%");
	});

	it("should block execution when coverage < 100%", async () => {
		const missionId = "mission-integration-002";

		// Insert mission
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			missionId,
			"Incomplete Mission",
			"Mission with coverage gaps",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		// Assertions
		const assertions: Assertion[] = [
			{
				id: "VAL-001",
				description: "Feature A works",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "deterministic",
				sourceIndex: 0,
			},
			{
				id: "VAL-002",
				description: "Feature B works",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "deterministic",
				sourceIndex: 1,
			},
			{
				id: "VAL-003",
				description: "Feature C works",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "deterministic",
				sourceIndex: 2,
			},
		];

		// Features (incomplete coverage)
		const features: Feature[] = [
			{
				id: "feat-001",
				name: "Feature A",
				description: "Implements A",
				status: "pending",
				fulfills: ["VAL-001"],
				preconditions: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			// VAL-002 and VAL-003 are orphans
		];

		const validator = createCoverageValidator(db);
		const result = validator.validate(assertions, features);

		// Should fail
		expect(result.passed).toBe(false);
		expect(result.orphanAssertions).toHaveLength(2);
		expect(result.orphanAssertions).toContain("VAL-002");
		expect(result.orphanAssertions).toContain("VAL-003");

		// Save failed validation
		await validator.saveValidationResult(missionId, result);

		const savedResult = db
			.prepare(
				"SELECT * FROM coverage_validations WHERE mission_id = ? ORDER BY id DESC LIMIT 1",
			)
			.get(missionId) as Record<string, unknown>;

		expect(savedResult.passed).toBe(0);

		// Report should indicate failure
		const report = validator.generateReport(result);
		expect(report).toContain("❌ Failed");
		expect(report).toContain("⚠️ Orphan Assertions (2)");
		expect(report).toContain("Must fix before starting work");
	});

	it("should allow execution when coverage = 100%", async () => {
		const missionId = "mission-integration-003";

		// Insert mission
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			missionId,
			"Complete Mission",
			"Mission with 100% coverage",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		// Assertions
		const assertions: Assertion[] = [
			{
				id: "VAL-001",
				description: "Requirement 1",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "deterministic",
				sourceIndex: 0,
			},
			{
				id: "VAL-002",
				description: "Requirement 2",
				status: "pending",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				missionId,
				type: "semantic",
				sourceIndex: 1,
			},
		];

		// Features (complete coverage)
		const features: Feature[] = [
			{
				id: "feat-001",
				name: "Complete Feature",
				description: "Implements all requirements",
				status: "pending",
				fulfills: ["VAL-001", "VAL-002"],
				preconditions: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const validator = createCoverageValidator(db);
		const result = validator.validate(assertions, features);

		// Should pass
		expect(result.passed).toBe(true);
		expect(result.coveragePercentage).toBe(100);
		expect(result.orphanAssertions).toHaveLength(0);
		expect(result.duplicateClaims.size).toBe(0);

		// This would allow execution to proceed
		const canExecute = result.passed;
		expect(canExecute).toBe(true);

		// Save successful validation
		await validator.saveValidationResult(missionId, result);

		const savedResult = db
			.prepare(
				"SELECT * FROM coverage_validations WHERE mission_id = ? ORDER BY id DESC LIMIT 1",
			)
			.get(missionId) as Record<string, unknown>;

		expect(savedResult.passed).toBe(1);

		// Report should be positive
		const report = validator.generateReport(result);
		expect(report).toContain("✅ Passed");
		expect(report).toContain("Ready to start work");
	});

	it("should handle complex scenarios with DAG dependencies", async () => {
		const missionId = "mission-integration-004";

		// Insert mission
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			missionId,
			"Complex DAG Mission",
			"Mission with feature dependencies",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		// Multiple assertions
		const assertions: Assertion[] = [
			{ id: "VAL-001", description: "DB schema", status: "pending" as const },
			{
				id: "VAL-002",
				description: "API endpoint",
				status: "pending" as const,
			},
			{
				id: "VAL-003",
				description: "Frontend form",
				status: "pending" as const,
			},
			{
				id: "VAL-004",
				description: "Validation logic",
				status: "pending" as const,
			},
			{
				id: "VAL-005",
				description: "Error handling",
				status: "pending" as const,
			},
		].map((a) => ({
			...a,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			missionId,
			type: "deterministic" as const,
			sourceIndex: 0,
		}));

		// Features with DAG
		const features: Feature[] = [
			{
				id: "feat-001",
				name: "Database Layer",
				description: "Set up database",
				status: "pending",
				fulfills: ["VAL-001"],
				preconditions: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: "feat-002",
				name: "API Layer",
				description: "Build API",
				status: "pending",
				fulfills: ["VAL-002", "VAL-004"],
				preconditions: ["feat-001"],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: "feat-003",
				name: "Frontend Layer",
				description: "Build UI",
				status: "pending",
				fulfills: ["VAL-003", "VAL-005"],
				preconditions: ["feat-002"],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const validator = createCoverageValidator(db);
		const result = validator.validate(assertions, features);

		// All assertions should be claimed
		expect(result.passed).toBe(true);
		expect(result.totalAssertions).toBe(5);
		expect(result.claimedAssertions).toBe(5);
		expect(result.coveragePercentage).toBe(100);

		// Verify distribution of assertions across features
		const feat001 = features.find((f) => f.id === "feat-001");
		const feat002 = features.find((f) => f.id === "feat-002");
		const feat003 = features.find((f) => f.id === "feat-003");

		expect(feat001?.fulfills.length).toBe(1);
		expect(feat002?.fulfills.length).toBe(2);
		expect(feat003?.fulfills.length).toBe(2);

		await validator.saveValidationResult(missionId, result);

		const report = validator.generateReport(result);
		expect(report).toContain("✅ Passed");
	});
});
