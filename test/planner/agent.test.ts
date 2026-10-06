/**
 * Planner Agent unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	createPlannerAgent,
	exportFeaturesJson,
	type PlannerAgent,
} from "../../src/planner/agent.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import type { MissionDocument } from "../../src/types/mission-document.js";
import type { Assertion } from "../../src/types/assertion.js";
import type { Feature } from "../../src/types/feature.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Planner Agent", () => {
	let db: SqliteDb;
	let agent: PlannerAgent;

	beforeEach(() => {
		db = openDatabase(":memory:");
		agent = createPlannerAgent(db, "one-to-one");
	});

	afterEach(() => {
		db.close();
	});

	describe("generateFeatures", () => {
		it("should generate one feature per assertion (one-to-one strategy)", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background context", "More context", "Even more"],
				goal: "Test goal",
				boundaries: { inScope: ["A"], outOfScope: ["B"] },
				successCriteria: ["Criterion 1", "Criterion 2", "Criterion 3"],
				architectureConstraints: ["Use TypeScript", "Follow REST"],
				risks: [{ description: "Risk 1" }],
				rawMarkdown: "# Mission: Test",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Users can login",
					status: "pending",
					type: "semantic",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-002",
					description: "Password validation works",
					status: "pending",
					type: "deterministic",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-003",
					description: "Error messages are clear",
					status: "pending",
					type: "semantic",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features).toHaveLength(3);
			expect(features[0].fulfills).toEqual(["VAL-001"]);
			expect(features[1].fulfills).toEqual(["VAL-002"]);
			expect(features[2].fulfills).toEqual(["VAL-003"]);
		});

		it("should assign sequential feat-XXX IDs", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["A", "B", "C"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Assertion 1",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-002",
					description: "Assertion 2",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-003",
					description: "Assertion 3",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-004",
					description: "Assertion 4",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features[0].id).toBe("feat-001");
			expect(features[1].id).toBe("feat-002");
			expect(features[2].id).toBe("feat-003");
			expect(features[3].id).toBe("feat-004");
		});

		it("should claim exactly one assertion per feature in fulfills", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test goal",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Assertion 1",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-002",
					description: "Assertion 2",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			// Each feature should claim exactly one assertion
			expect(features[0].fulfills).toHaveLength(1);
			expect(features[1].fulfills).toHaveLength(1);

			// No duplicates
			const allClaims = features.flatMap((f) => f.fulfills);
			expect(allClaims).toHaveLength(2);
			expect(new Set(allClaims).size).toBe(2);
		});

		it("should include mission context in feature description", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["This is the background context"],
				goal: "Test goal",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: ["Use bcrypt", "Follow REST API"],
				risks: [],
				rawMarkdown: "",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Users can login",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features[0].description).toContain("Users can login");
			expect(features[0].description).toContain(
				"This is the background context",
			);
			expect(features[0].description).toContain("Use bcrypt");
			expect(features[0].description).toContain("Follow REST API");
		});

		it("should truncate long assertion descriptions for feature name", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const longDescription =
				"This is a very long assertion description that exceeds fifty characters and should be truncated";
			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: longDescription,
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features[0].name).toHaveLength(50);
			expect(features[0].name.endsWith("...")).toBe(true);
			expect(features[0].name).toBe(`${longDescription.substring(0, 47)}...`);
		});

		it("should not truncate short assertion descriptions", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const shortDescription = "Short assertion";
			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: shortDescription,
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features[0].name).toBe(shortDescription);
		});

		it("should set all preconditions to empty array (Phase 2.1)", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Assertion 1",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "VAL-002",
					description: "Assertion 2",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			for (const feature of features) {
				expect(feature.preconditions).toEqual([]);
			}
		});

		it("should set initial status to pending", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Assertion 1",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features[0].status).toBe("pending");
		});

		it("should set createdAt and updatedAt timestamps", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const assertions: Assertion[] = [
				{
					id: "VAL-001",
					description: "Assertion 1",
					status: "pending",
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			const features = await agent.generateFeatures(
				"mission-001",
				mission,
				assertions,
			);

			expect(features[0].createdAt).toBeTruthy();
			expect(features[0].updatedAt).toBeTruthy();
			expect(new Date(features[0].createdAt).getTime()).toBeGreaterThan(0);
			expect(new Date(features[0].updatedAt).getTime()).toBeGreaterThan(0);
		});

		it("should handle empty assertions array", async () => {
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const features = await agent.generateFeatures("mission-001", mission, []);

			expect(features).toHaveLength(0);
		});

		it("should throw error for unsupported strategy", async () => {
			const groupedAgent = createPlannerAgent(db, "grouped");
			const mission: MissionDocument = {
				name: "Test Mission",
				background: ["Background"],
				goal: "Test",
				boundaries: { inScope: [], outOfScope: [] },
				successCriteria: [],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			await expect(
				groupedAgent.generateFeatures("mission-001", mission, []),
			).rejects.toThrow("Unsupported strategy: grouped");
		});
	});

	describe("saveFeatures", () => {
		beforeEach(() => {
			// Setup mission first (foreign key constraint)
			db.prepare(
				`INSERT INTO missions (id, name, description, status, created_at, updated_at)
         VALUES ('mission-001', 'Test Mission', 'Test', 'pending', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
			).run();
		});

		it("should save features to database", async () => {
			const features: Feature[] = [
				{
					id: "feat-001",
					missionId: "mission-001",
					name: "Feature 1",
					description: "Description 1",
					status: "pending",
					fulfills: ["VAL-001"],
					preconditions: [],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "feat-002",
					missionId: "mission-001",
					name: "Feature 2",
					description: "Description 2",
					status: "pending",
					fulfills: ["VAL-002"],
					preconditions: [],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			await agent.saveFeatures("mission-001", features);

			const saved = db
				.prepare("SELECT * FROM features WHERE mission_id = ? ORDER BY id")
				.all("mission-001");

			expect(saved).toHaveLength(2);
			expect(saved[0]).toMatchObject({
				id: "feat-001",
				name: "Feature 1",
				mission_id: "mission-001",
			});
			expect(saved[1]).toMatchObject({
				id: "feat-002",
				name: "Feature 2",
				mission_id: "mission-001",
			});
		});

		it("should link features to mission via mission_id", async () => {
			const features: Feature[] = [
				{
					id: "feat-001",
					missionId: "mission-001",
					name: "Feature 1",
					description: "Description 1",
					status: "pending",
					fulfills: ["VAL-001"],
					preconditions: [],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			await agent.saveFeatures("mission-001", features);

			const saved = db
				.prepare("SELECT mission_id FROM features WHERE id = ?")
				.get("feat-001") as { mission_id: string };

			expect(saved.mission_id).toBe("mission-001");
		});

		it("should serialize JSON fields correctly", async () => {
			const features: Feature[] = [
				{
					id: "feat-001",
					missionId: "mission-001",
					name: "Feature 1",
					description: "Description 1",
					status: "pending",
					fulfills: ["VAL-001", "VAL-002"],
					preconditions: ["feat-000"],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			await agent.saveFeatures("mission-001", features);

			const saved = db
				.prepare("SELECT fulfills, preconditions FROM features WHERE id = ?")
				.get("feat-001") as { fulfills: string; preconditions: string };

			expect(JSON.parse(saved.fulfills)).toEqual(["VAL-001", "VAL-002"]);
			expect(JSON.parse(saved.preconditions)).toEqual(["feat-000"]);
		});

		it("should save empty arrays as JSON", async () => {
			const features: Feature[] = [
				{
					id: "feat-001",
					missionId: "mission-001",
					name: "Feature 1",
					description: "Description 1",
					status: "pending",
					fulfills: [],
					preconditions: [],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			await agent.saveFeatures("mission-001", features);

			const saved = db
				.prepare("SELECT fulfills, preconditions FROM features WHERE id = ?")
				.get("feat-001") as { fulfills: string; preconditions: string };

			expect(JSON.parse(saved.fulfills)).toEqual([]);
			expect(JSON.parse(saved.preconditions)).toEqual([]);
		});
	});

	describe("exportFeaturesJson", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-test-"));

			// Setup mission and features
			db.prepare(
				`INSERT INTO missions (id, name, description, status, created_at, updated_at)
         VALUES ('mission-001', 'Test Mission', 'Test', 'pending', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
			).run();

			const features: Feature[] = [
				{
					id: "feat-001",
					missionId: "mission-001",
					name: "Feature 1",
					description: "Description 1",
					status: "pending",
					fulfills: ["VAL-001"],
					preconditions: [],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "feat-002",
					missionId: "mission-001",
					name: "Feature 2",
					description: "Description 2",
					status: "completed",
					fulfills: ["VAL-002"],
					preconditions: ["feat-001"],
					currentWorkerSessionId: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			];

			await agent.saveFeatures("mission-001", features);
		});

		afterEach(async () => {
			await fs.rm(tempDir, { recursive: true, force: true });
		});

		it("should export features.json with correct format", async () => {
			const outputPath = path.join(tempDir, "features.json");
			await exportFeaturesJson("mission-001", db, outputPath);

			const content = await fs.readFile(outputPath, "utf-8");
			const parsed = JSON.parse(content);

			expect(parsed).toHaveProperty("features");
			expect(parsed).toHaveProperty("metadata");
			expect(parsed.features).toHaveLength(2);
			expect(parsed.metadata.missionId).toBe("mission-001");
			expect(parsed.metadata.totalCount).toBe(2);
			expect(parsed.metadata.exportedAt).toBeTruthy();
		});

		it("should deserialize JSON fields", async () => {
			const outputPath = path.join(tempDir, "features.json");
			await exportFeaturesJson("mission-001", db, outputPath);

			const content = await fs.readFile(outputPath, "utf-8");
			const parsed = JSON.parse(content);

			expect(parsed.features[0].fulfills).toEqual(["VAL-001"]);
			expect(parsed.features[0].preconditions).toEqual([]);
			expect(parsed.features[1].fulfills).toEqual(["VAL-002"]);
			expect(parsed.features[1].preconditions).toEqual(["feat-001"]);
		});

		it("should include all feature fields", async () => {
			const outputPath = path.join(tempDir, "features.json");
			await exportFeaturesJson("mission-001", db, outputPath);

			const content = await fs.readFile(outputPath, "utf-8");
			const parsed = JSON.parse(content);

			const feature = parsed.features[0];
			expect(feature).toHaveProperty("id");
			expect(feature).toHaveProperty("name");
			expect(feature).toHaveProperty("description");
			expect(feature).toHaveProperty("status");
			expect(feature).toHaveProperty("fulfills");
			expect(feature).toHaveProperty("preconditions");
		});

		it("should export features in ID order", async () => {
			const outputPath = path.join(tempDir, "features.json");
			await exportFeaturesJson("mission-001", db, outputPath);

			const content = await fs.readFile(outputPath, "utf-8");
			const parsed = JSON.parse(content);

			expect(parsed.features[0].id).toBe("feat-001");
			expect(parsed.features[1].id).toBe("feat-002");
		});
	});

	describe("end-to-end", () => {
		it("should generate, save, and export features", async () => {
			const tempDir = await fs.mkdtemp(
				path.join(os.tmpdir(), "planner-e2e-test-"),
			);

			try {
				// Setup mission
				db.prepare(
					`INSERT INTO missions (id, name, description, status, created_at, updated_at)
           VALUES ('mission-001', 'E2E Test Mission', 'Test', 'pending', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
				).run();

				const mission: MissionDocument = {
					name: "E2E Test Mission",
					background: ["Background for E2E test"],
					goal: "Complete E2E test",
					boundaries: { inScope: ["A", "B"], outOfScope: ["C"] },
					successCriteria: ["Criterion 1", "Criterion 2"],
					architectureConstraints: ["Use TypeScript"],
					risks: [{ description: "Risk 1" }],
					rawMarkdown: "# Mission: E2E Test",
				};

				const assertions: Assertion[] = [
					{
						id: "VAL-001",
						description: "First assertion",
						status: "pending",
						type: "deterministic",
						createdAt: "2026-01-01T00:00:00Z",
						updatedAt: "2026-01-01T00:00:00Z",
					},
					{
						id: "VAL-002",
						description: "Second assertion",
						status: "pending",
						type: "semantic",
						createdAt: "2026-01-01T00:00:00Z",
						updatedAt: "2026-01-01T00:00:00Z",
					},
				];

				// Generate features
				const features = await agent.generateFeatures(
					"mission-001",
					mission,
					assertions,
				);
				expect(features).toHaveLength(2);

				// Save to database
				await agent.saveFeatures("mission-001", features);

				// Verify database
				const saved = db
					.prepare("SELECT * FROM features WHERE mission_id = ? ORDER BY id")
					.all("mission-001");
				expect(saved).toHaveLength(2);

				// Export to JSON
				const outputPath = path.join(tempDir, "features.json");
				await exportFeaturesJson("mission-001", db, outputPath);

				// Verify exported JSON
				const content = await fs.readFile(outputPath, "utf-8");
				const parsed = JSON.parse(content);
				expect(parsed.features).toHaveLength(2);
				expect(parsed.metadata.missionId).toBe("mission-001");

				// Verify all assertions are claimed
				const allClaims = parsed.features.flatMap((f: Feature) => f.fulfills);
				expect(allClaims).toContain("VAL-001");
				expect(allClaims).toContain("VAL-002");
			} finally {
				await fs.rm(tempDir, { recursive: true, force: true });
			}
		});
	});
});
