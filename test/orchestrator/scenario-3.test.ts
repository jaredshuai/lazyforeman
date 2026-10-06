import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DefaultPlanAdjuster } from "../../src/orchestrator/plan-adjuster.js";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import type { Feature } from "../../src/types/feature.js";
import type { Assertion } from "../../src/types/assertion.js";
import {
	mockInfeasibleAssertionIssue,
	mockMultipleInfeasibleIssue,
} from "./fixtures/mock-issues.js";

describe("Scenario 3: Infeasible Assertion Handling", () => {
	let db: SqliteDb;
	let planAdjuster: DefaultPlanAdjuster;
	let mockSignalManager: {
		send: () => Promise<string>;
	};

	beforeEach(() => {
		db = openDatabase(":memory:");
		mockSignalManager = {
			send: async () => "signal-001",
		};
		planAdjuster = new DefaultPlanAdjuster(mockSignalManager as any, db);

		// Setup test data
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

	it("should mark assertion as infeasible when issue specifies affected assertions", async () => {
		// Setup: Insert assertion and feature
		const assertion: Assertion = {
			id: "VAL-010",
			description: "支持 IE 11 浏览器",
			status: "pending",
			type: "deterministic",
			claimedBy: "feat-001",
			missionId: "mission-001",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

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

		// Act
		const result = await planAdjuster.handleInfeasibleAssertion(
			mockInfeasibleAssertionIssue,
			feature,
		);

		// Assert
		expect(result.action).toBe("assertion_modified");
		expect(result.modifiedAssertions).toBeDefined();
		expect(result.modifiedAssertions?.length).toBe(1);
		expect(result.modifiedAssertions?.[0].status).toBe("infeasible");
		expect(result.modifiedAssertions?.[0].notes).toContain("Worker 报告不可行");

		// Verify database update
		const updatedAssertion = db
			.prepare("SELECT * FROM assertions WHERE id = ?")
			.get("VAL-010") as any;
		expect(updatedAssertion.status).toBe("infeasible");
		expect(updatedAssertion.notes).toContain("Worker 报告不可行");
	});

	it("should update feature to remove infeasible assertions from fulfills", async () => {
		// Setup
		const assertion: Assertion = {
			id: "VAL-010",
			description: "支持 IE 11 浏览器",
			status: "pending",
			type: "deterministic",
			claimedBy: "feat-001",
			missionId: "mission-001",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

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

		const feature: Feature = {
			id: "feat-001",
			missionId: "mission-001",
			name: "Browser Compatibility",
			description: "Support old browsers",
			status: "in_progress",
			fulfills: ["VAL-010", "VAL-009"],
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

		// Act
		const result = await planAdjuster.handleInfeasibleAssertion(
			mockInfeasibleAssertionIssue,
			feature,
		);

		// Assert
		expect(result.updatedFeatures).toBeDefined();
		expect(result.updatedFeatures?.length).toBe(1);
		expect(result.updatedFeatures?.[0].fulfills).toEqual(["VAL-009"]);

		// Verify database update
		const updatedFeature = db
			.prepare("SELECT * FROM features WHERE id = ?")
			.get("feat-001") as any;
		const fulfills = JSON.parse(updatedFeature.fulfills);
		expect(fulfills).toEqual(["VAL-009"]);
		expect(fulfills).not.toContain("VAL-010");
	});

	it("should handle multiple infeasible assertions", async () => {
		// Setup
		const assertions: Assertion[] = [
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
			{
				id: "VAL-011",
				description: "支持 Safari 10",
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
				assertion.claimedBy,
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
			fulfills: ["VAL-010", "VAL-011"],
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

		// Act
		const result = await planAdjuster.handleInfeasibleAssertion(
			mockMultipleInfeasibleIssue,
			feature,
		);

		// Assert
		expect(result.action).toBe("assertion_modified");
		expect(result.modifiedAssertions?.length).toBe(2);
		expect(result.updatedFeatures?.[0].fulfills).toEqual([]);

		// Verify both assertions marked as infeasible
		const assertion1 = db
			.prepare("SELECT * FROM assertions WHERE id = ?")
			.get("VAL-010") as any;
		const assertion2 = db
			.prepare("SELECT * FROM assertions WHERE id = ?")
			.get("VAL-011") as any;
		expect(assertion1.status).toBe("infeasible");
		expect(assertion2.status).toBe("infeasible");
	});

	it("should return no_action_needed when issue has no affected assertions", async () => {
		const feature: Feature = {
			id: "feat-001",
			missionId: "mission-001",
			name: "Test Feature",
			description: "Test",
			status: "in_progress",
			fulfills: [],
			preconditions: [],
			currentWorkerSessionId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const issueWithoutAffectedAssertions = {
			...mockInfeasibleAssertionIssue,
			affectedAssertions: undefined,
		};

		// Act
		const result = await planAdjuster.handleInfeasibleAssertion(
			issueWithoutAffectedAssertions,
			feature,
		);

		// Assert
		expect(result.action).toBe("no_action_needed");
		expect(result.reasoning).toContain("未指定受影响的断言");
	});

	it("should validate coverage after modification", async () => {
		// Setup: Create assertions where one will become infeasible
		const assertions: Assertion[] = [
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
			{
				id: "VAL-012",
				description: "登录功能正常",
				status: "pending",
				type: "semantic",
				claimedBy: undefined, // This will become orphan after VAL-010 is removed
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

		// Act
		const result = await planAdjuster.handleInfeasibleAssertion(
			mockInfeasibleAssertionIssue,
			feature,
		);

		// Assert: Should report coverage validation failure
		expect(result.reasoning).toContain("覆盖验证失败");
		expect(result.reasoning).toContain("VAL-012");
	});
});
