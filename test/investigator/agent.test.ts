/**
 * Investigator Agent unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createInvestigatorAgent,
	type InvestigatorAgent,
} from "../../src/investigator/agent.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import type { MissionDocument } from "../../src/types/mission-document.js";

describe("Investigator Agent", () => {
	let db: SqliteDb;
	let agent: InvestigatorAgent;

	beforeEach(() => {
		db = openDatabase(":memory:");
		agent = createInvestigatorAgent(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("extractAssertions", () => {
		it("should generate assertions from success criteria", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background 1", "Background 2", "Background 3"],
				goal: "Test goal",
				boundaries: { inScope: ["A"], outOfScope: ["B"] },
				successCriteria: [
					"Users can login with email and password",
					"System validates password strength",
				],
				architectureConstraints: ["Use bcrypt"],
				risks: [{ description: "Security risk" }],
				rawMarkdown: "# Mission: Test",
			};

			const result = await agent.extractAssertions(mission);

			expect(result.assertions).toHaveLength(2);
			expect(result.metadata.totalGenerated).toBe(2);
			expect(result.metadata.sourceDocument).toBe("mission.md");
		});

		it("should assign sequential VAL-XXX IDs", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [
					"Criterion 1",
					"Criterion 2",
					"Criterion 3",
					"Criterion 4",
				],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			expect(result.assertions[0].id).toBe("VAL-001");
			expect(result.assertions[1].id).toBe("VAL-002");
			expect(result.assertions[2].id).toBe("VAL-003");
			expect(result.assertions[3].id).toBe("VAL-004");
		});

		it("should classify deterministic assertions correctly", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [
					"All tests pass successfully",
					"System should verify authentication",
					"Code must compile without errors",
					"Execute validation checks",
				],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			expect(result.assertions[0].type).toBe("deterministic"); // "tests pass"
			expect(result.assertions[1].type).toBe("deterministic"); // "verify"
			expect(result.assertions[2].type).toBe("deterministic"); // "compile"
			expect(result.assertions[3].type).toBe("deterministic"); // "execute"
			expect(result.metadata.deterministicCount).toBe(4);
		});

		it("should classify semantic assertions correctly", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [
					"User interface is intuitive",
					"Design looks professional",
					"用户体验良好",
					"界面布局美观",
				],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			expect(result.assertions[0].type).toBe("semantic"); // "interface", "intuitive"
			expect(result.assertions[1].type).toBe("semantic"); // "design"
			expect(result.assertions[2].type).toBe("semantic"); // "用户体验"
			expect(result.assertions[3].type).toBe("semantic"); // "界面"
			expect(result.metadata.semanticCount).toBe(4);
		});

		it("should preserve source index for traceability", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["First", "Second", "Third"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			expect(result.assertions[0].sourceIndex).toBe(0);
			expect(result.assertions[1].sourceIndex).toBe(1);
			expect(result.assertions[2].sourceIndex).toBe(2);
		});

		it("should mark all assertions as created from mission.md", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["Criterion 1", "Criterion 2"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			for (const assertion of result.assertions) {
				expect(assertion.createdFrom).toBe("mission.md");
			}
		});

		it("should initialize all assertions with pending status", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["Criterion 1", "Criterion 2"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			for (const assertion of result.assertions) {
				expect(assertion.status).toBe("pending");
			}
		});

		it("should set timestamps on all assertions", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["Criterion 1"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			expect(result.assertions[0].createdAt).toBeTruthy();
			expect(result.assertions[0].updatedAt).toBeTruthy();
			expect(typeof result.assertions[0].createdAt).toBe("string");
		});

		it("should default to semantic when no keywords match", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [
					"System provides functionality",
					"Application handles requests",
				],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const result = await agent.extractAssertions(mission);

			// Default to semantic (conservative strategy)
			expect(result.assertions[0].type).toBe("semantic");
			expect(result.assertions[1].type).toBe("semantic");
		});
	});

	describe("saveAssertions", () => {
		it("should save assertions to database", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["Criterion 1", "Criterion 2"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			// Create mission record first (foreign key requirement)
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-001",
				"Test Mission",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			const result = await agent.extractAssertions(mission);
			await agent.saveAssertions("mission-001", result.assertions);

			const saved = db
				.prepare("SELECT * FROM assertions WHERE mission_id = ?")
				.all("mission-001");

			expect(saved).toHaveLength(2);
		});

		it("should link assertions to mission via mission_id", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["Criterion 1"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			// Create mission record first
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-test-123",
				"Test Mission",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			const result = await agent.extractAssertions(mission);
			await agent.saveAssertions("mission-test-123", result.assertions);

			const saved = db
				.prepare("SELECT mission_id FROM assertions WHERE id = ?")
				.get("VAL-001") as { mission_id: string };

			expect(saved.mission_id).toBe("mission-test-123");
		});

		it("should store all assertion fields correctly", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: ["All tests must pass"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			// Create mission record first
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-001",
				"Test Mission",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			const result = await agent.extractAssertions(mission);
			await agent.saveAssertions("mission-001", result.assertions);

			const saved = db
				.prepare("SELECT * FROM assertions WHERE id = ?")
				.get("VAL-001") as {
				id: string;
				description: string;
				status: string;
				type: string;
				source_index: number;
				created_from: string;
			};

			expect(saved.id).toBe("VAL-001");
			expect(saved.description).toBe("All tests must pass");
			expect(saved.status).toBe("pending");
			expect(saved.type).toBe("deterministic");
			expect(saved.source_index).toBe(0);
			expect(saved.created_from).toBe("mission.md");
		});
	});

	describe("saveMissionMetadata", () => {
		it("should save mission metadata to database", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background 1", "Background 2", "Background 3"],
				goal: "Achieve the test goal",
				boundaries: { inScope: ["A", "B"], outOfScope: ["C"] },
				successCriteria: ["Criterion 1"],
				architectureConstraints: ["Use PostgreSQL"],
				risks: [{ description: "Performance risk", impact: "High" }],
				rawMarkdown: "# Mission: Test",
			};

			// Create mission record first
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-001",
				"Test Mission",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			await agent.saveMissionMetadata("mission-001", mission);

			const saved = db
				.prepare("SELECT * FROM missions_metadata WHERE mission_id = ?")
				.get("mission-001") as {
				mission_id: string;
				goal: string;
				raw_markdown: string;
			};

			expect(saved.mission_id).toBe("mission-001");
			expect(saved.goal).toBe("Achieve the test goal");
			expect(saved.raw_markdown).toBe("# Mission: Test");
		});

		it("should serialize JSON fields correctly", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: ["X"], outOfScope: ["Y"] },
				successCriteria: ["C1", "C2"],
				architectureConstraints: ["AC1"],
				risks: [{ description: "Risk 1" }],
				rawMarkdown: "",
			};

			// Create mission record first
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-001",
				"Test Mission",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			await agent.saveMissionMetadata("mission-001", mission);

			const saved = db
				.prepare("SELECT * FROM missions_metadata WHERE mission_id = ?")
				.get("mission-001") as {
				background_json: string;
				boundaries_json: string;
				success_criteria_json: string;
				architecture_constraints_json: string;
				risks_json: string;
			};

			expect(JSON.parse(saved.background_json)).toEqual(["A", "B", "C"]);
			expect(JSON.parse(saved.boundaries_json)).toEqual({
				inScope: ["X"],
				outOfScope: ["Y"],
			});
			expect(JSON.parse(saved.success_criteria_json)).toEqual(["C1", "C2"]);
			expect(JSON.parse(saved.architecture_constraints_json)).toEqual(["AC1"]);
			expect(JSON.parse(saved.risks_json)).toEqual([{ description: "Risk 1" }]);
		});

		it("should store raw markdown", async () => {
			const rawMarkdown = `# Mission: Test

## Background
- Item 1
- Item 2

## Goal
Achieve something`;

			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown,
			};

			// Create mission record first
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-001",
				"Test Mission",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			await agent.saveMissionMetadata("mission-001", mission);

			const saved = db
				.prepare(
					"SELECT raw_markdown FROM missions_metadata WHERE mission_id = ?",
				)
				.get("mission-001") as { raw_markdown: string };

			expect(saved.raw_markdown).toBe(rawMarkdown);
		});
	});

	describe("end-to-end", () => {
		it("should extract, save, and retrieve assertions", async () => {
			const mission: MissionDocument = {
				name: "Login Feature",
				background: [
					"Users need authentication",
					"Current system has no login",
					"Security is a priority",
				],
				goal: "Implement secure login functionality",
				boundaries: {
					inScope: ["Email login", "Password validation"],
					outOfScope: ["OAuth", "2FA"],
				},
				successCriteria: [
					"Users can login with email and password",
					"All authentication tests pass",
					"Login UI is intuitive",
				],
				architectureConstraints: ["Use bcrypt for passwords", "JWT tokens"],
				risks: [
					{
						description: "Password storage vulnerability",
						impact: "High",
						mitigation: "Use bcrypt with salt rounds >= 10",
					},
				],
				rawMarkdown: "# Mission: Login Feature\n\n...",
			};

			// Create mission record first
			db.prepare(
				"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			).run(
				"mission-login",
				"Login Feature",
				"pending",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			// Extract assertions
			const result = await agent.extractAssertions(mission);
			expect(result.assertions).toHaveLength(3);
			// Classification logic:
			// "Users can login with email and password" - contains "user" -> semantic
			// "All authentication tests pass" - contains "test" and "pass" -> deterministic
			// "Login UI is intuitive" - contains "ui" and "intuitive" -> semantic
			expect(result.metadata.deterministicCount).toBe(1); // "tests pass"
			expect(result.metadata.semanticCount).toBe(2); // "user", "intuitive"

			// Save mission metadata
			await agent.saveMissionMetadata("mission-login", mission);

			// Save assertions
			await agent.saveAssertions("mission-login", result.assertions);

			// Retrieve and verify
			const savedAssertions = db
				.prepare(
					"SELECT * FROM assertions WHERE mission_id = ? ORDER BY source_index",
				)
				.all("mission-login");

			expect(savedAssertions).toHaveLength(3);

			const savedMetadata = db
				.prepare("SELECT * FROM missions_metadata WHERE mission_id = ?")
				.get("mission-login") as { goal: string };

			expect(savedMetadata.goal).toBe("Implement secure login functionality");
		});
	});
});
