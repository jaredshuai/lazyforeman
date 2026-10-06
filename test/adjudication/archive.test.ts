/**
 * Unit tests for Decision Archive (feat-012)
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DefaultDecisionArchive } from "../../src/adjudication/archive.js";
import {
	mockConsensusResult,
	mockMajorityResult,
	mockDeadlockResult,
	mockIssue,
} from "./fixtures/mock-archive.js";

const TEST_BASE_DIR = ".test-lazyforeman-unit";
const TEST_MISSION_ID = "test-mission";

describe("DefaultDecisionArchive", () => {
	let archive: DefaultDecisionArchive;

	beforeEach(() => {
		archive = new DefaultDecisionArchive(TEST_BASE_DIR);
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("archive()", () => {
		test("should create archive directory structure", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Verify directory exists
			const stat = await fs.stat(archivePath);
			expect(stat.isDirectory()).toBe(true);

			// Verify path format (handle both Windows and Unix path separators)
			const normalizedPath = archivePath.replace(/\\/g, "/");
			expect(normalizedPath).toMatch(
				new RegExp(
					`${TEST_BASE_DIR}/missions/${TEST_MISSION_ID}/decisions/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}-issue-020`,
				),
			);
		});

		test("should write metadata.json with correct data", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Read metadata
			const metadataPath = path.join(archivePath, "metadata.json");
			const metadataContent = await fs.readFile(metadataPath, "utf-8");
			const metadata = JSON.parse(metadataContent);

			expect(metadata).toMatchObject({
				missionId: TEST_MISSION_ID,
				issueId: mockIssue.id,
				participants: mockConsensusResult.allProposals.length,
			});

			expect(metadata.timestamp).toBeDefined();
			expect(metadata.duration).toBeGreaterThanOrEqual(0);
		});

		test("should write round files for each round", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Verify each round file exists
			for (const round of mockConsensusResult.rounds) {
				const roundPath = path.join(archivePath, `round-${round.round}.json`);
				const roundContent = await fs.readFile(roundPath, "utf-8");
				const roundData = JSON.parse(roundContent);

				expect(roundData).toEqual(round);
			}
		});

		test("should write outcome.json", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Read outcome
			const outcomePath = path.join(archivePath, "outcome.json");
			const outcomeContent = await fs.readFile(outcomePath, "utf-8");
			const outcome = JSON.parse(outcomeContent);

			expect(outcome).toEqual(mockConsensusResult);
		});

		test("should generate README.md with human-readable summary", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Read README
			const readmePath = path.join(archivePath, "README.md");
			const readmeContent = await fs.readFile(readmePath, "utf-8");

			// Verify README contains key information
			expect(readmeContent).toContain("# 裁决记录");
			expect(readmeContent).toContain(TEST_MISSION_ID);
			expect(readmeContent).toContain(mockIssue.id);
			expect(readmeContent).toContain(mockIssue.description);
			expect(readmeContent).toContain(mockConsensusResult.outcome);
			expect(readmeContent).toContain(mockConsensusResult.reasoning);

			// Verify rounds are mentioned
			for (const round of mockConsensusResult.rounds) {
				expect(readmeContent).toContain(`第 ${round.round} 轮`);
			}

			// Verify proposals are listed
			for (const proposal of mockConsensusResult.allProposals) {
				expect(readmeContent).toContain(proposal.id);
				expect(readmeContent).toContain(proposal.solution);
			}
		});

		test("should handle majority outcome", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockMajorityResult,
				startTime,
			);

			// Verify archive created
			const stat = await fs.stat(archivePath);
			expect(stat.isDirectory()).toBe(true);

			// Verify outcome
			const outcomePath = path.join(archivePath, "outcome.json");
			const outcomeContent = await fs.readFile(outcomePath, "utf-8");
			const outcome = JSON.parse(outcomeContent);

			expect(outcome.outcome).toBe("majority");
		});

		test("should handle deadlock outcome", async () => {
			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockDeadlockResult,
				startTime,
			);

			// Verify archive created
			const stat = await fs.stat(archivePath);
			expect(stat.isDirectory()).toBe(true);

			// Verify README indicates deadlock
			const readmePath = path.join(archivePath, "README.md");
			const readmeContent = await fs.readFile(readmePath, "utf-8");

			expect(readmeContent).toContain("deadlock");
			expect(readmeContent).toContain("胜出方案**: N/A");
		});

		test("should sanitize issue ID for filesystem", async () => {
			const issueWithSpecialChars = {
				...mockIssue,
				id: "ISSUE@#$%020",
			};

			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				issueWithSpecialChars,
				mockConsensusResult,
				startTime,
			);

			// Verify path is sanitized (handle both Windows and Unix path separators)
			const normalizedPath = archivePath.replace(/\\/g, "/");
			expect(normalizedPath).toMatch(/issue----020$/);

			// Verify archive still works
			const stat = await fs.stat(archivePath);
			expect(stat.isDirectory()).toBe(true);
		});

		test("should calculate duration correctly", async () => {
			const startTime = new Date(Date.now() - 5000); // 5 seconds ago

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Read metadata
			const metadataPath = path.join(archivePath, "metadata.json");
			const metadataContent = await fs.readFile(metadataPath, "utf-8");
			const metadata = JSON.parse(metadataContent);

			// Duration should be approximately 5000ms (with some tolerance)
			expect(metadata.duration).toBeGreaterThan(4000);
			expect(metadata.duration).toBeLessThan(6000);
		});

		test("should create nested directories recursively", async () => {
			const deepMissionId = "deep/nested/mission";
			const startTime = new Date();

			const archivePath = await archive.archive(
				deepMissionId,
				mockIssue,
				mockConsensusResult,
				startTime,
			);

			// Verify directory exists
			const stat = await fs.stat(archivePath);
			expect(stat.isDirectory()).toBe(true);
		});

		test("should handle issue without explicit ID", async () => {
			const issueNoId = {
				...mockIssue,
				id: undefined as unknown as string,
			};

			const startTime = new Date();

			const archivePath = await archive.archive(
				TEST_MISSION_ID,
				issueNoId,
				mockConsensusResult,
				startTime,
			);

			// Should use "unknown-issue" as fallback
			expect(archivePath).toContain("unknown-issue");

			// Verify archive works
			const stat = await fs.stat(archivePath);
			expect(stat.isDirectory()).toBe(true);
		});
	});
});
