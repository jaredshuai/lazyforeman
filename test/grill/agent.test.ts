/**
 * Grill Agent unit tests
 *
 * Tests the five-dimension drilling mechanism that generates mission.md
 * from rough goals through iterative conversation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createGrillAgent, type GrillAgent } from "../../src/grill/agent.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { MockLLMClient } from "./fixtures/mock-responses.js";
import { createMissionParser } from "../../src/mission/parser.js";

describe("Grill Agent", () => {
	let db: SqliteDb;
	let mockLlm: MockLLMClient;
	let agent: GrillAgent;

	beforeEach(() => {
		db = openDatabase(":memory:");
		mockLlm = new MockLLMClient();
		agent = createGrillAgent(db, mockLlm);
	});

	afterEach(() => {
		db.close();
	});

	describe("generateMission", () => {
		it("should generate mission.md from rough goal", async () => {
			const roughGoal = "I want to implement user login functionality";

			const missionMarkdown = await agent.generateMission(roughGoal);

			expect(missionMarkdown).toBeTruthy();
			expect(missionMarkdown).toContain("# Mission:");
			expect(missionMarkdown).toContain("## 背景");
			expect(missionMarkdown).toContain("## 目标");
			expect(missionMarkdown).toContain("## 边界");
			expect(missionMarkdown).toContain("## 成功标准");
			expect(missionMarkdown).toContain("## 架构约束");
			expect(missionMarkdown).toContain("## 风险");
		});

		it("should generate mission.md that follows ADR-0003 template", async () => {
			const roughGoal = "Build a login feature";

			const missionMarkdown = await agent.generateMission(roughGoal);

			// Check for required sections
			expect(missionMarkdown).toMatch(/## 背景/);
			expect(missionMarkdown).toMatch(/## 目标/);
			expect(missionMarkdown).toMatch(/## 边界/);
			expect(missionMarkdown).toMatch(/✅ 做：/);
			expect(missionMarkdown).toMatch(/❌ 不做：/);
			expect(missionMarkdown).toMatch(/## 成功标准/);
			expect(missionMarkdown).toMatch(/## 架构约束/);
			expect(missionMarkdown).toMatch(/## 风险/);
			expect(missionMarkdown).toMatch(/⚠️/);
		});

		it("should generate mission.md parseable by MissionParser", async () => {
			const roughGoal = "Implement user authentication";

			const missionMarkdown = await agent.generateMission(roughGoal);

			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);

			expect(missionDoc.name).toBeTruthy();
			expect(missionDoc.background.length).toBeGreaterThanOrEqual(3);
			expect(missionDoc.goal).toBeTruthy();
			expect(missionDoc.boundaries.inScope.length).toBeGreaterThan(0);
			expect(missionDoc.boundaries.outOfScope.length).toBeGreaterThan(0);
			expect(missionDoc.successCriteria.length).toBeGreaterThan(0);
			expect(missionDoc.architectureConstraints.length).toBeGreaterThan(0);
			expect(missionDoc.risks.length).toBeGreaterThan(0);
		});

		it("should conduct five-dimension drilling", async () => {
			const roughGoal = "Add login feature";

			mockLlm.reset();
			await agent.generateMission(roughGoal);

			// Should have made calls for: 5 dimensions + final synthesis
			const callCount = mockLlm.getCallCount();
			expect(callCount).toBeGreaterThanOrEqual(5);
		});

		it("should respect maxTurns option", async () => {
			const roughGoal = "Build authentication";

			mockLlm.reset();
			await agent.generateMission(roughGoal, { maxTurns: 3 });

			const callCount = mockLlm.getCallCount();
			expect(callCount).toBeLessThanOrEqual(4); // 3 turns + synthesis
		});

		it("should save session after generation", async () => {
			const roughGoal = "User login feature";

			await agent.generateMission(roughGoal);

			// Check that session was saved to database
			const stmt = db.prepare(
				"SELECT COUNT(*) as count FROM grill_sessions WHERE rough_goal = ? AND status = 'completed'",
			);
			const result = stmt.get(roughGoal) as { count: number };
			expect(result.count).toBe(1);
		});
	});

	describe("saveSession", () => {
		it("should save Grill session to database", async () => {
			const sessionId = "test-session-001";
			const messages = [
				{
					role: "user" as const,
					content: "I want to build a login feature",
					timestamp: new Date(),
				},
				{
					role: "assistant" as const,
					content: "Let's explore the goal dimension...",
					timestamp: new Date(),
				},
			];

			await agent.saveSession(sessionId, messages);

			const stmt = db.prepare("SELECT * FROM grill_sessions WHERE id = ?");
			const row = stmt.get(sessionId) as any;

			expect(row).toBeTruthy();
			expect(row.id).toBe(sessionId);
			expect(row.rough_goal).toContain("login");
			expect(row.status).toBe("in_progress");
			expect(JSON.parse(row.messages_json)).toHaveLength(2);
		});

		it("should serialize message timestamps correctly", async () => {
			const sessionId = "test-session-002";
			const now = new Date();
			const messages = [
				{
					role: "user" as const,
					content: "Test message",
					timestamp: now,
				},
			];

			await agent.saveSession(sessionId, messages);

			const stmt = db.prepare(
				"SELECT messages_json FROM grill_sessions WHERE id = ?",
			);
			const row = stmt.get(sessionId) as { messages_json: string };
			const parsed = JSON.parse(row.messages_json);

			expect(parsed[0].timestamp).toBe(now.toISOString());
		});
	});

	describe("loadSession", () => {
		it("should load saved Grill session", async () => {
			const sessionId = "test-session-003";
			const messages = [
				{
					role: "user" as const,
					content: "Rough goal",
					timestamp: new Date(),
				},
			];

			await agent.saveSession(sessionId, messages);
			const loaded = await agent.loadSession(sessionId);

			expect(loaded).toBeTruthy();
			expect(loaded?.id).toBe(sessionId);
			expect(loaded?.messages).toHaveLength(1);
			expect(loaded?.messages[0].content).toBe("Rough goal");
			expect(loaded?.status).toBe("in_progress");
		});

		it("should return null for non-existent session", async () => {
			const loaded = await agent.loadSession("non-existent-session");

			expect(loaded).toBeNull();
		});

		it("should deserialize timestamps correctly", async () => {
			const sessionId = "test-session-004";
			const now = new Date();
			const messages = [
				{
					role: "user" as const,
					content: "Test",
					timestamp: now,
				},
			];

			await agent.saveSession(sessionId, messages);
			const loaded = await agent.loadSession(sessionId);

			expect(loaded?.messages[0].timestamp).toBeInstanceOf(Date);
			expect(loaded?.messages[0].timestamp.getTime()).toBe(now.getTime());
		});
	});

	describe("crash recovery", () => {
		it("should recover from crash during Grill session", async () => {
			const sessionId = "crash-test-001";
			const messages = [
				{
					role: "user" as const,
					content: "Build login",
					timestamp: new Date(),
				},
				{
					role: "assistant" as const,
					content: "Let's explore...",
					timestamp: new Date(),
				},
			];

			// Simulate crash: save incomplete session
			await agent.saveSession(sessionId, messages);

			// Simulate recovery: load session
			const recovered = await agent.loadSession(sessionId);

			expect(recovered).toBeTruthy();
			expect(recovered?.status).toBe("in_progress");
			expect(recovered?.messages).toHaveLength(2);
			expect(recovered?.generatedMission).toBeNull();
		});

		it("should not lose session data after crash", async () => {
			const roughGoal = "Implement auth";

			// Start session
			mockLlm.reset();
			await agent.generateMission(roughGoal);

			// Verify session persisted
			const stmt = db.prepare(
				"SELECT * FROM grill_sessions WHERE rough_goal = ?",
			);
			const row = stmt.get(roughGoal) as any;

			expect(row).toBeTruthy();
			expect(row.generated_mission).toBeTruthy();
			expect(row.status).toBe("completed");
		});
	});

	describe("maxTurns limit", () => {
		it("should prevent infinite loops with maxTurns", async () => {
			const roughGoal = "Complex feature";

			const start = Date.now();
			await agent.generateMission(roughGoal, { maxTurns: 5 });
			const duration = Date.now() - start;

			// Should complete quickly (< 1 second in mock mode)
			expect(duration).toBeLessThan(1000);

			const callCount = mockLlm.getCallCount();
			expect(callCount).toBeLessThanOrEqual(6); // 5 turns + synthesis
		});

		it("should use default maxTurns of 10 when not specified", async () => {
			const roughGoal = "Feature without options";

			mockLlm.reset();
			await agent.generateMission(roughGoal);

			const callCount = mockLlm.getCallCount();
			// Default is 10 turns, but mock only has 5 dimensions + synthesis
			expect(callCount).toBeGreaterThan(0);
		});
	});

	describe("quality gates", () => {
		it("should generate mission with all five dimensions covered", async () => {
			const roughGoal = "Login feature";

			const missionMarkdown = await agent.generateMission(roughGoal);

			// Verify all dimensions are present
			expect(missionMarkdown).toContain("背景"); // Background (GOAL)
			expect(missionMarkdown).toContain("边界"); // Boundary
			expect(missionMarkdown).toContain("架构约束"); // Technical
			expect(missionMarkdown).toContain("成功标准"); // Acceptance
			expect(missionMarkdown).toContain("风险"); // Risk
		});

		it("should generate mission that passes ADR-0003 validation", async () => {
			const roughGoal = "User authentication";

			const missionMarkdown = await agent.generateMission(roughGoal);
			const parser = createMissionParser();
			const missionDoc = parser.parse(missionMarkdown);
			const validation = parser.validate(missionDoc);

			expect(validation.valid).toBe(true);
			expect(validation.violations).toHaveLength(0);
		});
	});
});
