import { describe, it, expect, beforeEach } from "vitest";
import { DefaultCoverageValidator } from "../../src/validator/coverage-validator.js";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import type { Assertion } from "../../src/types/assertion.js";
import type { Feature } from "../../src/types/feature.js";
import {
	mockFeasibleAssertion,
	mockInfeasibleAssertion,
	mockPendingAssertion,
	mockAnotherInfeasibleAssertion,
} from "../orchestrator/fixtures/mock-assertions.js";

describe("Coverage Validator: Infeasible Assertions", () => {
	let db: SqliteDb;
	let validator: DefaultCoverageValidator;

	beforeEach(() => {
		db = openDatabase(":memory:");
		validator = new DefaultCoverageValidator(db);
	});

	it("should exclude infeasible assertions from coverage validation", () => {
		// Arrange
		const assertions: Assertion[] = [
			mockFeasibleAssertion,
			mockInfeasibleAssertion, // status: 'infeasible'
			mockPendingAssertion,
		];

		const features: Feature[] = [
			{
				id: "feat-001",
				missionId: "mission-001",
				name: "Login Feature",
				description: "User login",
				status: "pending",
				fulfills: ["VAL-001", "VAL-002"],
				preconditions: [],
				currentWorkerSessionId: null,
				createdAt: "2026-10-06T10:00:00Z",
				updatedAt: "2026-10-06T10:00:00Z",
			},
		];

		// Act
		const result = validator.validate(assertions, features);

		// Assert
		// VAL-010 is infeasible, so only VAL-001 and VAL-002 should count
		expect(result.totalAssertions).toBe(2); // Only feasible assertions
		expect(result.claimedAssertions).toBe(2);
		expect(result.passed).toBe(true);
	});

	it("should pass validation when all feasible assertions are claimed", () => {
		// Arrange
		const assertions: Assertion[] = [
			mockFeasibleAssertion, // VAL-001, claimed by feat-001
			mockInfeasibleAssertion, // VAL-010, infeasible
			mockPendingAssertion, // VAL-002, claimed by feat-002
		];

		const features: Feature[] = [
			{
				id: "feat-001",
				missionId: "mission-001",
				name: "Feature 1",
				description: "Test",
				status: "pending",
				fulfills: ["VAL-001"],
				preconditions: [],
				currentWorkerSessionId: null,
				createdAt: "2026-10-06T10:00:00Z",
				updatedAt: "2026-10-06T10:00:00Z",
			},
			{
				id: "feat-002",
				missionId: "mission-001",
				name: "Feature 2",
				description: "Test",
				status: "pending",
				fulfills: ["VAL-002"],
				preconditions: [],
				currentWorkerSessionId: null,
				createdAt: "2026-10-06T10:00:00Z",
				updatedAt: "2026-10-06T10:00:00Z",
			},
		];

		// Act
		const result = validator.validate(assertions, features);

		// Assert
		expect(result.passed).toBe(true);
		expect(result.totalAssertions).toBe(2); // Only feasible
		expect(result.claimedAssertions).toBe(2);
		expect(result.coveragePercentage).toBe(100);
		expect(result.orphanAssertions).toEqual([]);
		expect(result.duplicateClaims.size).toBe(0);
	});

	it("should detect orphan feasible assertions when infeasible ones are excluded", () => {
		// Arrange
		const assertions: Assertion[] = [
			mockFeasibleAssertion, // VAL-001, claimed
			mockInfeasibleAssertion, // VAL-010, infeasible (excluded)
			{
				...mockPendingAssertion,
				claimedBy: undefined, // VAL-002, NOT claimed (orphan)
			},
		];

		const features: Feature[] = [
			{
				id: "feat-001",
				missionId: "mission-001",
				name: "Feature 1",
				description: "Test",
				status: "pending",
				fulfills: ["VAL-001"], // Only claims VAL-001
				preconditions: [],
				currentWorkerSessionId: null,
				createdAt: "2026-10-06T10:00:00Z",
				updatedAt: "2026-10-06T10:00:00Z",
			},
		];

		// Act
		const result = validator.validate(assertions, features);

		// Assert
		expect(result.passed).toBe(false); // VAL-002 is orphan
		expect(result.totalAssertions).toBe(2); // VAL-001 and VAL-002 (feasible)
		expect(result.orphanAssertions).toContain("VAL-002");
		expect(result.orphanAssertions).not.toContain("VAL-010"); // infeasible, excluded
	});

	it("should handle all assertions being infeasible", () => {
		// Arrange
		const assertions: Assertion[] = [
			mockInfeasibleAssertion,
			mockAnotherInfeasibleAssertion,
		];

		const features: Feature[] = [];

		// Act
		const result = validator.validate(assertions, features);

		// Assert
		expect(result.totalAssertions).toBe(0); // No feasible assertions
		expect(result.passed).toBe(false); // No assertions to validate
		expect(result.coveragePercentage).toBe(0);
	});

	it("should handle mixed feasible and infeasible with partial coverage", () => {
		// Arrange
		const assertions: Assertion[] = [
			mockFeasibleAssertion, // VAL-001, should be claimed
			mockInfeasibleAssertion, // VAL-010, infeasible (excluded)
			mockPendingAssertion, // VAL-002, should be claimed
			mockAnotherInfeasibleAssertion, // VAL-011, infeasible (excluded)
		];

		const features: Feature[] = [
			{
				id: "feat-001",
				missionId: "mission-001",
				name: "Feature 1",
				description: "Test",
				status: "pending",
				fulfills: ["VAL-001"], // Only claims VAL-001, VAL-002 is orphan
				preconditions: [],
				currentWorkerSessionId: null,
				createdAt: "2026-10-06T10:00:00Z",
				updatedAt: "2026-10-06T10:00:00Z",
			},
		];

		// Act
		const result = validator.validate(assertions, features);

		// Assert
		expect(result.totalAssertions).toBe(2); // Only VAL-001 and VAL-002
		expect(result.claimedAssertions).toBe(1); // Only VAL-001 claimed
		expect(result.coveragePercentage).toBe(50);
		expect(result.passed).toBe(false);
		expect(result.orphanAssertions).toContain("VAL-002");
		expect(result.orphanAssertions).not.toContain("VAL-010");
		expect(result.orphanAssertions).not.toContain("VAL-011");
	});

	it("should generate report mentioning only feasible assertions", () => {
		// Arrange
		const assertions: Assertion[] = [
			mockFeasibleAssertion,
			mockInfeasibleAssertion,
			{
				...mockPendingAssertion,
				claimedBy: undefined, // Orphan
			},
		];

		const features: Feature[] = [
			{
				id: "feat-001",
				missionId: "mission-001",
				name: "Feature 1",
				description: "Test",
				status: "pending",
				fulfills: ["VAL-001"],
				preconditions: [],
				currentWorkerSessionId: null,
				createdAt: "2026-10-06T10:00:00Z",
				updatedAt: "2026-10-06T10:00:00Z",
			},
		];

		// Act
		const result = validator.validate(assertions, features);
		const report = validator.generateReport(result);

		// Assert
		expect(report).toContain("Total Assertions**: 2"); // Only feasible
		expect(report).toContain("VAL-002"); // Orphan feasible assertion
		expect(report).not.toContain("VAL-010"); // Infeasible, not in report
	});
});
