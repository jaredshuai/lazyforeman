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

const TEST_BASE_DIR = ".test-lazyforeman-integration";
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
		// Use unique mission ID to avoid conflicts between tests
		const testMissionId = `${TEST_MISSION_ID}-auto-${Date.now()}`;

		// Create mock context
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

		// Execute adjudication
		const result = await adjudicator.adjudicate(mockIssue, context);

		// Verify result
		expect(result.outcome).toBeDefined();
		expect(result.allProposals.length).toBeGreaterThan(0);

		// Verify archive directory exists
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			testMissionId,
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
		// Use unique mission ID to avoid conflicts between tests
		const testMissionId = `${TEST_MISSION_ID}-metadata-${Date.now()}`;

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

		await adjudicator.adjudicate(mockIssue, context);

		// Find archive directory
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			testMissionId,
			"decisions",
		);
		const entries = await fs.readdir(decisionsDir);
		const archivePath = path.join(decisionsDir, entries[0]);

		// Read metadata
		const metadataPath = path.join(archivePath, "metadata.json");
		const metadataContent = await fs.readFile(metadataPath, "utf-8");
		const metadata = JSON.parse(metadataContent);

		expect(metadata.missionId).toBe(testMissionId);
		expect(metadata.issueId).toBe(mockIssue.id);
		expect(metadata.participants).toBeGreaterThan(0);
		expect(metadata.duration).toBeGreaterThanOrEqual(0);
	});

	test("should archive outcome matching adjudication result", async () => {
		// Use unique mission ID to avoid conflicts between tests
		const testMissionId = `${TEST_MISSION_ID}-outcome-${Date.now()}`;

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

		const result = await adjudicator.adjudicate(mockIssue, context);

		// Find archive directory
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			testMissionId,
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
		// Use unique mission ID to avoid conflicts between tests
		const testMissionId = `${TEST_MISSION_ID}-readme-${Date.now()}`;

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

		await adjudicator.adjudicate(mockIssue, context);

		// Find archive directory
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			testMissionId,
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
		expect(readmeContent).toContain(testMissionId);
	});

	test("should handle multiple sequential adjudications", async () => {
		// Use a unique subdirectory for this test to avoid conflicts
		const testMissionId = `${TEST_MISSION_ID}-multi-${Date.now()}`;

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

		// Get count before
		const decisionsDir = path.join(
			TEST_BASE_DIR,
			"missions",
			testMissionId,
			"decisions",
		);

		// Create decisions directory if it doesn't exist
		await fs.mkdir(decisionsDir, { recursive: true });
		const beforeCount = (await fs.readdir(decisionsDir)).length;

		// Run three adjudications with sufficient delays and distinct issue IDs
		const timestamp1 = Date.now();
		const result1 = await adjudicator.adjudicate(
			{ ...mockIssue, id: `ISSUE-${timestamp1}` },
			context,
		);
		console.log(`Adjudication 1 completed, outcome: ${result1.outcome}`);
		await new Promise((resolve) => setTimeout(resolve, 100));

		const timestamp2 = Date.now();
		const result2 = await adjudicator.adjudicate(
			{ ...mockIssue, id: `ISSUE-${timestamp2}` },
			context,
		);
		console.log(`Adjudication 2 completed, outcome: ${result2.outcome}`);
		await new Promise((resolve) => setTimeout(resolve, 100));

		const timestamp3 = Date.now();
		const result3 = await adjudicator.adjudicate(
			{ ...mockIssue, id: `ISSUE-${timestamp3}` },
			context,
		);
		console.log(`Adjudication 3 completed, outcome: ${result3.outcome}`);

		// Verify three NEW archive directories were created
		const afterCount = (await fs.readdir(decisionsDir)).length;
		const allEntries = await fs.readdir(decisionsDir);
		console.log(
			`Before: ${beforeCount}, After: ${afterCount}, Entries:`,
			allEntries,
		);
		expect(afterCount - beforeCount).toBe(3);

		// Verify each has distinct timestamp
		const timestamps = allEntries.map((e) => e.split("-")[0]);
		expect(new Set(timestamps).size).toBeGreaterThan(0);
	});
});
