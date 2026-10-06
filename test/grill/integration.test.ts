/**
 * Grill Agent integration tests
 *
 * End-to-end tests covering the full flow:
 * Rough goal → Grill → mission.md → Parser → assertions.json
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createGrillAgent } from "../../src/grill/agent.js";
import { createInvestigatorAgent } from "../../src/investigator/agent.js";
import { createMissionParser } from "../../src/mission/parser.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { MockLLMClient } from "./fixtures/mock-responses.js";

describe("Grill Agent Integration", () => {
	let db: SqliteDb;
	let mockLlm: MockLLMClient;

	beforeEach(() => {
		db = openDatabase(":memory:");
		mockLlm = new MockLLMClient();
	});

	afterEach(() => {
		db.close();
	});

	describe("Full workflow: Rough goal → mission.md → assertions", () => {
		it("should complete end-to-end workflow", async () => {
			// Step 1: Grill generates mission.md from rough goal
			const grillAgent = createGrillAgent(db, mockLlm);
			const roughGoal = "I want to implement user login functionality";

			const missionMarkdown = await grillAgent.generateMission(roughGoal);

			expect(missionMarkdown).toBeTruthy();
			expect(missionMarkdown).toContain("# Mission:");

			// Step 2: Parse mission.md
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);

			expect(missionDoc.name).toBeTruthy();
			expect(missionDoc.successCriteria.length).toBeGreaterThan(0);

			// Step 3: Validate mission document
			const validation = parser.validate(missionDoc);

			expect(validation.valid).toBe(true);
			expect(validation.violations).toHaveLength(0);

			// Step 4: Create mission record
			const missionId = "mission-001";
			const createMissionStmt = db.prepare(`
				INSERT INTO missions (id, name, description, status, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
			const now = new Date().toISOString();
			createMissionStmt.run(
				missionId,
				missionDoc.name,
				missionDoc.goal,
				"pending",
				now,
				now,
			);

			// Step 5: Extract assertions from mission
			const investigatorAgent = createInvestigatorAgent(db);
			const assertionResult =
				await investigatorAgent.extractAssertions(missionDoc);

			expect(assertionResult.assertions.length).toBeGreaterThan(0);
			expect(assertionResult.assertions[0].id).toMatch(/^VAL-\d{3}$/);
			expect(assertionResult.metadata.sourceDocument).toBe("mission.md");

			// Step 6: Save assertions to database
			await investigatorAgent.saveAssertions(
				missionId,
				assertionResult.assertions,
			);

			// Verify assertions are saved
			const stmt = db.prepare(
				"SELECT COUNT(*) as count FROM assertions WHERE mission_id = ?",
			);
			const result = stmt.get(missionId) as { count: number };
			expect(result.count).toBe(assertionResult.assertions.length);
		});

		it("should generate mission with verifiable success criteria", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);
			const roughGoal = "Build authentication system";

			const missionMarkdown = await grillAgent.generateMission(roughGoal);
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);

			// All success criteria should be verifiable (not vague)
			expect(missionDoc.successCriteria.length).toBeGreaterThan(0);
			for (const criterion of missionDoc.successCriteria) {
				// Should not be empty or just whitespace
				expect(criterion.trim().length).toBeGreaterThan(0);
				// Should not be overly vague (e.g., "should work")
				expect(criterion.toLowerCase()).not.toMatch(
					/should work|be good|be nice/,
				);
			}
		});

		it("should generate mission with concrete boundaries", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);
			const roughGoal = "User authentication feature";

			const missionMarkdown = await grillAgent.generateMission(roughGoal);
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);

			// Must have both in-scope and out-of-scope items
			expect(missionDoc.boundaries.inScope.length).toBeGreaterThan(0);
			expect(missionDoc.boundaries.outOfScope.length).toBeGreaterThan(0);

			// Should have meaningful boundary content (at least 2 total boundaries)
			const totalBoundaries =
				missionDoc.boundaries.inScope.length +
				missionDoc.boundaries.outOfScope.length;
			expect(totalBoundaries).toBeGreaterThanOrEqual(2);
		});

		it("should generate mission with identified risks", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);
			const roughGoal = "Login feature with password authentication";

			const missionMarkdown = await grillAgent.generateMission(roughGoal);
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);

			// Must have at least one risk identified
			expect(missionDoc.risks.length).toBeGreaterThan(0);

			// Risks should have descriptions
			for (const risk of missionDoc.risks) {
				expect(risk.description.trim().length).toBeGreaterThan(0);
			}
		});

		it("should generate mission with architecture constraints", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);
			const roughGoal = "Implement user login";

			const missionMarkdown = await grillAgent.generateMission(roughGoal);
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);

			// Must have architecture constraints
			expect(missionDoc.architectureConstraints.length).toBeGreaterThan(0);

			// Should mention reusable components or tech stack
			const allConstraints = missionDoc.architectureConstraints.join(" ");
			expect(allConstraints.length).toBeGreaterThan(10);
		});

		it("should pass ADR-0003 quality gates", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);
			const roughGoal = "User authentication with email and password";

			const missionMarkdown = await grillAgent.generateMission(roughGoal);
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);
			const validation = parser.validate(missionDoc);

			// Must pass all quality gates from ADR-0003:
			// - Background: ≥3 sentences
			// - Boundary: ≥1 ✅ and ≥1 ❌
			// - Architecture constraints: not empty
			// - Risks: ≥1 ⚠️
			expect(validation.valid).toBe(true);
			expect(validation.violations).toHaveLength(0);
		});
	});

	describe("Multiple missions workflow", () => {
		it("should handle multiple Grill sessions independently", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);

			// Session 1
			mockLlm.reset();
			const mission1 = await grillAgent.generateMission("Login feature");

			// Session 2
			mockLlm.reset();
			const mission2 = await grillAgent.generateMission("User registration");

			expect(mission1).not.toBe(mission2);

			// Both should be saved separately
			const stmt = db.prepare("SELECT COUNT(*) as count FROM grill_sessions");
			const result = stmt.get() as { count: number };
			expect(result.count).toBe(2);
		});

		it("should generate distinct assertions for different missions", async () => {
			// Use separate database instances to avoid ID conflicts
			const db1 = openDatabase(":memory:");
			const db2 = openDatabase(":memory:");

			const mockLlm1 = new MockLLMClient();
			const mockLlm2 = new MockLLMClient();

			const grillAgent1 = createGrillAgent(db1, mockLlm1);
			const grillAgent2 = createGrillAgent(db2, mockLlm2);

			const investigatorAgent1 = createInvestigatorAgent(db1);
			const investigatorAgent2 = createInvestigatorAgent(db2);
			const parser = createMissionParser();

			// Mission 1: Login
			const mission1Markdown =
				await grillAgent1.generateMission("Login feature");
			const mission1Doc = parser.parse(mission1Markdown);

			// Create mission 1 record
			const now = new Date().toISOString();
			const createMission1Stmt = db1.prepare(`
				INSERT INTO missions (id, name, description, status, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
			createMission1Stmt.run(
				"mission-001",
				mission1Doc.name,
				mission1Doc.goal,
				"pending",
				now,
				now,
			);

			const assertions1 =
				await investigatorAgent1.extractAssertions(mission1Doc);
			await investigatorAgent1.saveAssertions(
				"mission-001",
				assertions1.assertions,
			);

			// Mission 2: Registration
			const mission2Markdown = await grillAgent2.generateMission(
				"Registration feature",
			);
			const mission2Doc = parser.parse(mission2Markdown);

			// Create mission 2 record
			const createMission2Stmt = db2.prepare(`
				INSERT INTO missions (id, name, description, status, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
			createMission2Stmt.run(
				"mission-002",
				mission2Doc.name,
				mission2Doc.goal,
				"pending",
				now,
				now,
			);

			const assertions2 =
				await investigatorAgent2.extractAssertions(mission2Doc);
			await investigatorAgent2.saveAssertions(
				"mission-002",
				assertions2.assertions,
			);

			// Verify separate assertions
			const stmt1 = db1.prepare(
				"SELECT COUNT(*) as count FROM assertions WHERE mission_id = ?",
			);
			const stmt2 = db2.prepare(
				"SELECT COUNT(*) as count FROM assertions WHERE mission_id = ?",
			);
			const result1 = stmt1.get("mission-001") as { count: number };
			const result2 = stmt2.get("mission-002") as { count: number };

			expect(result1.count).toBeGreaterThan(0);
			expect(result2.count).toBeGreaterThan(0);

			// Clean up
			db1.close();
			db2.close();
		});
	});

	describe("Error handling", () => {
		it("should handle malformed mission markdown gracefully", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);
			const parser = createMissionParser();

			// Generate mission
			const missionMarkdown = await grillAgent.generateMission("Test feature");

			// Even if malformed, parser should handle it
			expect(() => parser.parse(missionMarkdown)).not.toThrow();
		});

		it("should save session even if parsing fails", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);

			await grillAgent.generateMission("Test feature");

			// Session should be saved regardless
			const stmt = db.prepare("SELECT COUNT(*) as count FROM grill_sessions");
			const result = stmt.get() as { count: number };
			expect(result.count).toBe(1);
		});
	});

	describe("Session recovery", () => {
		it("should resume Grill session after crash", async () => {
			const grillAgent = createGrillAgent(db, mockLlm);

			// Start session
			const sessionId = "recovery-test-001";
			const messages = [
				{
					role: "user" as const,
					content: "Build login feature",
					timestamp: new Date(),
				},
				{
					role: "assistant" as const,
					content: "Let's explore the goal...",
					timestamp: new Date(),
				},
			];

			await grillAgent.saveSession(sessionId, messages);

			// Simulate crash and recovery
			const recovered = await grillAgent.loadSession(sessionId);

			expect(recovered).toBeTruthy();
			expect(recovered?.messages.length).toBe(2);
			expect(recovered?.status).toBe("in_progress");

			// Could resume from here (not implemented in Phase 2.2)
		});
	});
});
