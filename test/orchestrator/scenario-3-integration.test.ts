import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DefaultPlanAdjuster } from "../../src/orchestrator/plan-adjuster.js";
import { DefaultCoverageValidator } from "../../src/validator/coverage-validator.js";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import type { Feature } from "../../src/types/feature.js";
import type { Assertion } from "../../src/types/assertion.js";
import { mockInfeasibleAssertionIssue } from "./fixtures/mock-issues.js";

describe("Scenario 3: End-to-End Integration", () => {
	let db: SqliteDb;
	let planAdjuster: DefaultPlanAdjuster;
	let coverageValidator: DefaultCoverageValidator;
	let mockSignalManager: {
		send: () => Promise<string>;
	};

	beforeEach(() => {
		db = openDatabase(":memory:");
		mockSignalManager = {
			send: async () => "signal-001",
		};
		planAdjuster = new DefaultPlanAdjuster(mockSignalManager as any, db);
		coverageValidator = new DefaultCoverageValidator(db);

		// Setup mission
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			"mission-001",
			"Test Mission",
			"Test mission description",
			"in_progress",
			new Date().toISOString(),
			new Date().toISOString(),
		);
	});

	afterEach(() => {
		db.close();
	});

	it("should handle complete scenario 3 flow: Worker reports infeasible → modify assertion → update feature → validate coverage", async () => {
		// Step 1: Setup initial state
		const assertions: Assertion[] = [
			{
				id: "VAL-001",
				description: "用户可以登录",
				status: "pending",
				type: "semantic",
				claimedBy: "feat-001",
				missionId: "mission-001",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: "VAL-010",
				description: "支持 IE 11 浏览器",
				status: "pending",
				type: "deterministic",
				claimedBy: "feat-002",
				missionId: "mission-001",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		for (const assertion of assertions) {
			db.prepare(
				`INSERT INTO assertions (id, description, status, type, claimed_by, mission_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				assertion.id,
				assertion.description,
				assertion.status,
				assertion.type,
				assertion.claimedBy,
				assertion.missionId,
				assertion.createdAt,
				assertion.updatedAt,
			);
		}

		const features: Feature[] = [
			{
				id: "feat-001",
				name: "Login Feature",
				description: "User login functionality",
				status: "completed",
				fulfills: ["VAL-001"],
				preconditions: [],
				missionId: "mission-001",
				currentWorkerSessionId: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: "feat-002",
				name: "Browser Compatibility",
				description: "Support old browsers",
				status: "in_progress",
				fulfills: ["VAL-010"],
				preconditions: [],
				missionId: "mission-001",
				currentWorkerSessionId: null,
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
				"mission-001",
				feature.name,
				feature.description,
				feature.status,
				JSON.stringify(feature.fulfills),
				JSON.stringify(feature.preconditions),
				feature.createdAt,
				feature.updatedAt,
			);
		}

		// Step 2: Verify initial coverage (should be 100%)
		const initialValidation = coverageValidator.validate(assertions, features);
		expect(initialValidation.passed).toBe(true);
		expect(initialValidation.totalAssertions).toBe(2);

		// Step 3: Worker reports assertion infeasible
		const adjustmentResult = await planAdjuster.handleInfeasibleAssertion(
			mockInfeasibleAssertionIssue,
			features[1],
		);

		// Step 4: Verify adjustment result
		expect(adjustmentResult.action).toBe("assertion_modified");
		expect(adjustmentResult.modifiedAssertions).toBeDefined();
		expect(adjustmentResult.modifiedAssertions?.length).toBe(1);
		expect(adjustmentResult.modifiedAssertions?.[0].id).toBe("VAL-010");
		expect(adjustmentResult.modifiedAssertions?.[0].status).toBe("infeasible");
		expect(adjustmentResult.updatedFeatures).toBeDefined();
		expect(adjustmentResult.updatedFeatures?.[0].fulfills).toEqual([]);

		// Step 5: Load updated assertions from database
		const updatedAssertionRows = db
			.prepare("SELECT * FROM assertions WHERE mission_id = ?")
			.all("mission-001") as Array<{
			id: string;
			description: string;
			status: string;
			type: string;
			claimed_by?: string;
			mission_id: string;
			created_at: string;
			updated_at: string;
			notes?: string;
		}>;

		const updatedAssertions: Assertion[] = updatedAssertionRows.map((row) => ({
			id: row.id,
			description: row.description,
			status: row.status as Assertion["status"],
			type: row.type as Assertion["type"],
			claimedBy: row.claimed_by,
			missionId: row.mission_id,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			notes: row.notes,
		}));

		// Step 6: Load updated features from database
		const updatedFeatureRows = db
			.prepare("SELECT * FROM features WHERE mission_id = ?")
			.all("mission-001") as Array<{
			id: string;
			name: string;
			description: string;
			status: string;
			fulfills: string;
			preconditions: string;
			created_at: string;
			updated_at: string;
		}>;

		const updatedFeatures: Feature[] = updatedFeatureRows.map((row) => ({
			id: row.id,
			missionId: "mission-001",
			name: row.name,
			description: row.description,
			status: row.status as Feature["status"],
			fulfills: JSON.parse(row.fulfills),
			preconditions: JSON.parse(row.preconditions),
			currentWorkerSessionId: null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));

		// Step 7: Re-validate coverage (should still be 100% of feasible assertions)
		const finalValidation = coverageValidator.validate(
			updatedAssertions,
			updatedFeatures,
		);

		expect(finalValidation.passed).toBe(true); // Only VAL-001 (feasible) needs to be claimed
		expect(finalValidation.totalAssertions).toBe(1); // Only VAL-001 is feasible
		expect(finalValidation.coveragePercentage).toBe(100);

		// Step 8: Verify VAL-010 is marked as infeasible
		const val010 = updatedAssertions.find((a) => a.id === "VAL-010");
		expect(val010?.status).toBe("infeasible");
		expect(val010?.notes).toContain("Worker 报告不可行");

		// Step 9: Verify feat-002 no longer claims VAL-010
		const feat002 = updatedFeatures.find((f) => f.id === "feat-002");
		expect(feat002?.fulfills).toEqual([]);
		expect(feat002?.fulfills).not.toContain("VAL-010");
	});

	it("should detect coverage failure when infeasible assertion leaves orphans", async () => {
		// Setup: Two assertions, both claimed by one feature
		const assertions: Assertion[] = [
			{
				id: "VAL-001",
				description: "用户可以登录",
				status: "pending",
				type: "semantic",
				claimedBy: undefined, // Not claimed initially
				missionId: "mission-001",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: "VAL-010",
				description: "支持 IE 11 浏览器",
				status: "pending",
				type: "deterministic",
				claimedBy: "feat-001",
				missionId: "mission-001",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		for (const assertion of assertions) {
			db.prepare(
				`INSERT INTO assertions (id, description, status, type, claimed_by, mission_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				assertion.id,
				assertion.description,
				assertion.status,
				assertion.type,
				assertion.claimedBy || null,
				assertion.missionId,
				assertion.createdAt,
				assertion.updatedAt,
			);
		}

		const feature: Feature = {
			id: "feat-001",
			missionId: "mission-001",
			name: "Browser Compatibility",
			description: "Support old browsers",
			status: "in_progress",
			fulfills: ["VAL-010"],
			preconditions: [],
			currentWorkerSessionId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		db.prepare(
			`INSERT INTO features (id, mission_id, name, description, status, fulfills, preconditions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			feature.id,
			"mission-001",
			feature.name,
			feature.description,
			feature.status,
			JSON.stringify(feature.fulfills),
			JSON.stringify(feature.preconditions),
			feature.createdAt,
			feature.updatedAt,
		);

		// Act: Handle infeasible assertion
		const result = await planAdjuster.handleInfeasibleAssertion(
			mockInfeasibleAssertionIssue,
			feature,
		);

		// Assert: Should report coverage validation failure
		expect(result.action).toBe("assertion_modified");
		expect(result.reasoning).toContain("覆盖验证失败");
		expect(result.reasoning).toContain("VAL-001"); // VAL-001 is now orphan
	});
});
