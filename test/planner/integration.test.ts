/**
 * Planner Agent integration tests
 *
 * Tests the full workflow from mission + assertions to features.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createPlannerAgent,
	exportFeaturesJson,
	type PlannerAgent,
} from "../../src/planner/agent.js";
import {
	createInvestigatorAgent,
	type InvestigatorAgent,
} from "../../src/investigator/agent.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { parseMissionMarkdown } from "../../src/mission/parser.js";
import type { MissionDocument } from "../../src/types/mission-document.js";
import type { Assertion } from "../../src/types/assertion.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Planner Integration", () => {
	let db: SqliteDb;
	let planner: PlannerAgent;
	let investigator: InvestigatorAgent;
	let tempDir: string;

	beforeEach(async () => {
		db = openDatabase(":memory:");
		planner = createPlannerAgent(db, "one-to-one");
		investigator = createInvestigatorAgent(db);
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-integration-"));
	});

	afterEach(async () => {
		db.close();
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should generate features from mission + assertions", async () => {
		const mission: MissionDocument = {
			name: "Login System",
			background: [
				"Users need to authenticate to access the system",
				"Current system has no authentication",
				"Security is a top priority",
			],
			goal: "Implement secure login system",
			boundaries: {
				inScope: [
					"Email/password login",
					"Password hashing",
					"Session management",
				],
				outOfScope: ["OAuth", "Two-factor auth", "Password reset"],
			},
			successCriteria: [
				"Users can login with email and password",
				"Passwords are hashed with bcrypt",
				"Invalid credentials show error message",
				"Sessions persist across page refreshes",
			],
			architectureConstraints: [
				"Use Express.js for backend",
				"Use bcrypt for password hashing",
				"Store sessions in Redis",
			],
			risks: [
				{
					description: "SQL injection vulnerability",
					impact: "Data breach",
					mitigation: "Use parameterized queries",
				},
			],
			rawMarkdown: "# Mission: Login System\n...",
		};

		const assertions: Assertion[] = [
			{
				id: "VAL-001",
				description: "Users can login with email and password",
				status: "pending",
				type: "semantic",
				sourceIndex: 0,
				createdFrom: "mission.md",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			},
			{
				id: "VAL-002",
				description: "Passwords are hashed with bcrypt",
				status: "pending",
				type: "deterministic",
				sourceIndex: 1,
				createdFrom: "mission.md",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			},
			{
				id: "VAL-003",
				description: "Invalid credentials show error message",
				status: "pending",
				type: "semantic",
				sourceIndex: 2,
				createdFrom: "mission.md",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			},
			{
				id: "VAL-004",
				description: "Sessions persist across page refreshes",
				status: "pending",
				type: "deterministic",
				sourceIndex: 3,
				createdFrom: "mission.md",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			},
		];

		// Generate features
		const features = await planner.generateFeatures(
			"mission-001",
			mission,
			assertions,
		);

		// Verify basic properties
		expect(features).toHaveLength(4);
		expect(features[0].id).toBe("feat-001");
		expect(features[1].id).toBe("feat-002");
		expect(features[2].id).toBe("feat-003");
		expect(features[3].id).toBe("feat-004");

		// Verify fulfills mapping
		expect(features[0].fulfills).toEqual(["VAL-001"]);
		expect(features[1].fulfills).toEqual(["VAL-002"]);
		expect(features[2].fulfills).toEqual(["VAL-003"]);
		expect(features[3].fulfills).toEqual(["VAL-004"]);

		// Verify all have empty preconditions
		for (const feature of features) {
			expect(feature.preconditions).toEqual([]);
		}

		// Verify context is included
		expect(features[0].description).toContain("Users can login");
		expect(features[0].description).toContain(
			"Users need to authenticate to access the system",
		);
		expect(features[1].description).toContain("Use Express.js for backend");
	});

	it("should ensure every assertion is claimed by exactly one feature", async () => {
		const mission: MissionDocument = {
			name: "Test Mission",
			background: ["Background 1", "Background 2", "Background 3"],
			goal: "Test goal",
			boundaries: { inScope: ["A"], outOfScope: ["B"] },
			successCriteria: [
				"Criterion 1",
				"Criterion 2",
				"Criterion 3",
				"Criterion 4",
				"Criterion 5",
			],
			architectureConstraints: ["Constraint 1"],
			risks: [{ description: "Risk 1" }],
			rawMarkdown: "# Mission: Test",
		};

		const assertions: Assertion[] = [];
		for (let i = 0; i < 5; i++) {
			assertions.push({
				id: `VAL-${String(i + 1).padStart(3, "0")}`,
				description: `Assertion ${i + 1}`,
				status: "pending",
				type: "semantic",
				sourceIndex: i,
				createdFrom: "mission.md",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			});
		}

		// Generate features
		const features = await planner.generateFeatures(
			"mission-001",
			mission,
			assertions,
		);

		// Collect all claims
		const allClaims = features.flatMap((f) => f.fulfills);

		// Verify 100% coverage
		expect(allClaims).toHaveLength(assertions.length);

		// Verify no duplicates
		expect(new Set(allClaims).size).toBe(assertions.length);

		// Verify all assertions are claimed
		for (const assertion of assertions) {
			expect(allClaims).toContain(assertion.id);
		}

		// Verify each assertion is claimed exactly once
		const claimCounts = new Map<string, number>();
		for (const claim of allClaims) {
			claimCounts.set(claim, (claimCounts.get(claim) || 0) + 1);
		}

		for (const [_assertionId, count] of claimCounts.entries()) {
			expect(count).toBe(1);
		}
	});

	it("should handle large missions with 30+ assertions", async () => {
		const mission: MissionDocument = {
			name: "Large Mission",
			background: [
				"Complex system with many requirements",
				"Multiple modules to implement",
				"Comprehensive test coverage needed",
			],
			goal: "Build comprehensive system",
			boundaries: {
				inScope: ["Module A", "Module B", "Module C"],
				outOfScope: ["Module D"],
			},
			successCriteria: Array.from(
				{ length: 35 },
				(_, i) => `Criterion ${i + 1}`,
			),
			architectureConstraints: [
				"Use microservices",
				"Follow REST API standards",
				"Implement rate limiting",
			],
			risks: [{ description: "Complexity risk" }],
			rawMarkdown: "# Mission: Large Mission\n...",
		};

		// Generate 35 assertions
		const assertions: Assertion[] = [];
		for (let i = 0; i < 35; i++) {
			assertions.push({
				id: `VAL-${String(i + 1).padStart(3, "0")}`,
				description: `Assertion ${i + 1} - detailed requirement description`,
				status: "pending",
				type: i % 2 === 0 ? "deterministic" : "semantic",
				sourceIndex: i,
				createdFrom: "mission.md",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			});
		}

		// Generate features
		const features = await planner.generateFeatures(
			"mission-001",
			mission,
			assertions,
		);

		// Verify all features were generated
		expect(features).toHaveLength(35);

		// Verify sequential IDs
		for (let i = 0; i < 35; i++) {
			expect(features[i].id).toBe(`feat-${String(i + 1).padStart(3, "0")}`);
		}

		// Verify 100% coverage
		const allClaims = features.flatMap((f) => f.fulfills);
		expect(allClaims).toHaveLength(35);
		expect(new Set(allClaims).size).toBe(35);

		// Verify all assertions are claimed
		for (const assertion of assertions) {
			const claimingFeatures = features.filter((f) =>
				f.fulfills.includes(assertion.id),
			);
			expect(claimingFeatures).toHaveLength(1);
		}
	});

	it("should integrate with Investigator Agent in full workflow", async () => {
		// Setup mission in database
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
       VALUES ('mission-001', 'Full Workflow Test', 'Test', 'pending', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
		).run();

		const missionMarkdown = `# Mission: User Authentication

## Background
- Current system lacks authentication
- Users need secure login
- Security is critical for production

## Goal
Implement secure user authentication system

## Boundary
✅ Email/password login
✅ Password hashing
✅ Session management
❌ OAuth providers
❌ Two-factor authentication

## Success Criteria
- [ ] Users can login with email and password
- [ ] Passwords are hashed securely
- [ ] Invalid credentials show error
- [ ] Sessions work across requests

## Architecture Constraints
- Use bcrypt for password hashing
- Use Express.js for backend

## Risks
⚠️ SQL injection: Use parameterized queries
`;

		// Parse mission
		const parseResult = parseMissionMarkdown(missionMarkdown);
		if (!parseResult.valid) {
			console.error("Validation errors:", parseResult.violations);
		}
		expect(parseResult.valid).toBe(true);
		expect(parseResult.document).toBeDefined();

		const mission = parseResult.document as MissionDocument;

		// Extract assertions (Investigator Agent)
		const assertionResult = await investigator.extractAssertions(mission);
		expect(assertionResult.assertions).toHaveLength(4);

		await investigator.saveAssertions(
			"mission-001",
			assertionResult.assertions,
		);
		await investigator.saveMissionMetadata("mission-001", mission);

		// Generate features (Planner Agent)
		const features = await planner.generateFeatures(
			"mission-001",
			mission,
			assertionResult.assertions,
		);
		expect(features).toHaveLength(4);

		await planner.saveFeatures("mission-001", features);

		// Export features.json
		const outputPath = path.join(tempDir, "features.json");
		await exportFeaturesJson("mission-001", db, outputPath);

		// Verify exported file
		const content = await fs.readFile(outputPath, "utf-8");
		const parsed = JSON.parse(content);

		expect(parsed.features).toHaveLength(4);
		expect(parsed.metadata.missionId).toBe("mission-001");

		// Verify database consistency
		const savedFeatures = db
			.prepare("SELECT * FROM features WHERE mission_id = ?")
			.all("mission-001");
		expect(savedFeatures).toHaveLength(4);

		const savedAssertions = db
			.prepare("SELECT * FROM assertions WHERE mission_id = ?")
			.all("mission-001");
		expect(savedAssertions).toHaveLength(4);

		// Verify all assertions are claimed
		const allClaims = parsed.features.flatMap(
			(f: { fulfills: string[] }) => f.fulfills,
		);
		const assertionIds = (savedAssertions as Array<{ id: string }>).map(
			(a) => a.id,
		);

		for (const assertionId of assertionIds) {
			expect(allClaims).toContain(assertionId);
		}
	});
});
