/**
 * Integration tests for Decision Archive with Adjudicator (feat-012)
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DefaultMultiAIAdjudicator } from "../../src/adjudication/adjudicator.js";
import { DefaultDecisionArchive } from "../../src/adjudication/archive.js";
import { mockIssue } from "./fixtures/mock-archive.js";
import type { AdjudicationContext } from "../../src/adjudication/types.js";
import type { MissionDocument } from "../../src/types/mission-document.js";

const TEST_BASE_DIR = ".test-lazyforeman";
const TEST_MISSION_ID = "integration-test-mission";

describe("Decision Archive Integration", () => {
	let adjudicator: DefaultMultiAIAdjudicator;
	let archive: DefaultDecisionArchive;

	beforeEach(() => {
		archive = new DefaultDecisionArchive(TEST_BASE_DIR);
		adjudicator = new DefaultMultiAIAdjudicator(archive);
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("should automatically archive decision after adjudication", async () => {
		// Create mock context
		const mockMissionDoc: MissionDocument = {
			name: TEST_MISSION_ID,
			background: ["Test background"],
			goal: "Test mission goal",
			boundaries: {
				inScope: ["Test scope"],
				outOfScope: ["Test exclusions"],
			},
			successCriteria: [],
			architectureConstraints: [],
			risks: [],
			rawMarkdown: "# Test Mission",
		};

		const context: AdjudicationContext = {
			missionDocument: mockMissionDoc,
			conflictDetails: {
				conflictLevel: "major",
				reasoning: "Test conflict",
				recommendation: "multi_ai_adjudication",
			},
			participants: 3,
		};

		// Execute adjudication
		const result = await adjudicator.adjudicate(mockIssue, context);

		// Verify result
		expect(result.outcome).toBeDefined();
		expect(result.allProposals.length).toBeGreaterThan(0);

		// Verify archive directory exists
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			TEST_MISSION_ID,
			"decisions",
		);
		const entries = await fs.readdir(decisionsDir);
		expect(entries.length).toBe(1);

		// Verify archive contains expected files
		const archivePath = path.join(decisionsDir, entries[0]);
		const files = await fs.readdir(archivePath);

		expect(files).toContain("metadata.json");
		expect(files).toContain("outcome.json");
		expect(files).toContain("README.md");

		// Verify at least one round file exists
		const roundFiles = files.filter((f) => f.startsWith("round-"));
		expect(roundFiles.length).toBeGreaterThan(0);
	});

	test("should archive metadata with correct mission information", async () => {
		const mockMissionDoc: MissionDocument = {
			name: TEST_MISSION_ID,
			background: ["Test background"],
			goal: "Test mission goal",
			boundaries: {
				inScope: ["Test scope"],
				outOfScope: ["Test exclusions"],
			},
			successCriteria: [],
			architectureConstraints: [],
			risks: [],
			rawMarkdown: "# Test Mission",
		};

		const context: AdjudicationContext = {
			missionDocument: mockMissionDoc,
			conflictDetails: {
				conflictLevel: "major",
				reasoning: "Test conflict",
				recommendation: "multi_ai_adjudication",
			},
			participants: 3,
		};

		await adjudicator.adjudicate(mockIssue, context);

		// Find archive directory
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			TEST_MISSION_ID,
			"decisions",
		);
		const entries = await fs.readdir(decisionsDir);
		const archivePath = path.join(decisionsDir, entries[0]);

		// Read metadata
		const metadataPath = path.join(archivePath, "metadata.json");
		const metadataContent = await fs.readFile(metadataPath, "utf-8");
		const metadata = JSON.parse(metadataContent);

		expect(metadata.missionId).toBe(TEST_MISSION_ID);
		expect(metadata.issueId).toBe(mockIssue.id);
		expect(metadata.participants).toBeGreaterThan(0);
		expect(metadata.duration).toBeGreaterThanOrEqual(0);
	});

	test("should archive outcome matching adjudication result", async () => {
		const mockMissionDoc: MissionDocument = {
			name: TEST_MISSION_ID,
			background: ["Test background"],
			goal: "Test mission goal",
			boundaries: {
				inScope: ["Test scope"],
				outOfScope: ["Test exclusions"],
			},
			successCriteria: [],
			architectureConstraints: [],
			risks: [],
			rawMarkdown: "# Test Mission",
		};

		const context: AdjudicationContext = {
			missionDocument: mockMissionDoc,
			conflictDetails: {
				conflictLevel: "major",
				reasoning: "Test conflict",
				recommendation: "multi_ai_adjudication",
			},
			participants: 3,
		};

		const result = await adjudicator.adjudicate(mockIssue, context);

		// Find archive directory
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			TEST_MISSION_ID,
			"decisions",
		);
		const entries = await fs.readdir(decisionsDir);
		const archivePath = path.join(decisionsDir, entries[0]);

		// Read outcome
		const outcomePath = path.join(archivePath, "outcome.json");
		const outcomeContent = await fs.readFile(outcomePath, "utf-8");
		const outcome = JSON.parse(outcomeContent);

		// Verify outcome matches result
		expect(outcome).toEqual(result);
	});

	test("should generate README with issue context", async () => {
		const mockMissionDoc: MissionDocument = {
			name: TEST_MISSION_ID,
			background: ["Test background"],
			goal: "Test mission goal",
			boundaries: {
				inScope: ["Test scope"],
				outOfScope: ["Test exclusions"],
			},
			successCriteria: [],
			architectureConstraints: [],
			risks: [],
			rawMarkdown: "# Test Mission",
		};

		const context: AdjudicationContext = {
			missionDocument: mockMissionDoc,
			conflictDetails: {
				conflictLevel: "major",
				reasoning: "Test conflict",
				recommendation: "multi_ai_adjudication",
			},
			participants: 3,
		};

		await adjudicator.adjudicate(mockIssue, context);

		// Find archive directory
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			TEST_MISSION_ID,
			"decisions",
		);
		const entries = await fs.readdir(decisionsDir);
		const archivePath = path.join(decisionsDir, entries[0]);

		// Read README
		const readmePath = path.join(archivePath, "README.md");
		const readmeContent = await fs.readFile(readmePath, "utf-8");

		// Verify README contains issue information
		expect(readmeContent).toContain(mockIssue.description);
		expect(readmeContent).toContain(mockIssue.severity);
		expect(readmeContent).toContain(TEST_MISSION_ID);
	});

	test("should handle multiple sequential adjudications", async () => {
		// Use a unique subdirectory for this test to avoid conflicts
		const testMissionId = `${TEST_MISSION_ID}-multi`;

		const mockMissionDoc: MissionDocument = {
			name: testMissionId,
			background: ["Test background"],
			goal: "Test mission goal",
			boundaries: {
				inScope: ["Test scope"],
				outOfScope: ["Test exclusions"],
			},
			successCriteria: [],
			architectureConstraints: [],
			risks: [],
			rawMarkdown: "# Test Mission",
		};

		const context: AdjudicationContext = {
			missionDocument: mockMissionDoc,
			conflictDetails: {
				conflictLevel: "major",
				reasoning: "Test conflict",
				recommendation: "multi_ai_adjudication",
			},
			participants: 3,
		};

		// Run three adjudications with small delays to ensure unique timestamps
		await adjudicator.adjudicate(mockIssue, context);
		await new Promise((resolve) => setTimeout(resolve, 10));
		await adjudicator.adjudicate({ ...mockIssue, id: "ISSUE-021" }, context);
		await new Promise((resolve) => setTimeout(resolve, 10));
		await adjudicator.adjudicate({ ...mockIssue, id: "ISSUE-022" }, context);

		// Verify three archive directories created
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			testMissionId,
			"decisions",
		);
		const entries = await fs.readdir(decisionsDir);
		expect(entries.length).toBe(3);

		// Verify each has distinct timestamp
		const timestamps = entries.map((e) => e.split("-")[0]);
		expect(new Set(timestamps).size).toBeGreaterThan(0);
	});
});
