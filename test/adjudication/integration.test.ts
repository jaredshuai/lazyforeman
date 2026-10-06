/**
 * Integration tests for Multi-AI Adjudication (feat-011)
 *
 * Tests end-to-end flow: conflict detection → adjudication → output
 */

import { describe, it, expect } from "vitest";
import { DefaultMultiAIAdjudicator } from "../../src/adjudication/adjudicator.js";
import { DefaultVisionConflictDetector } from "../../src/orchestrator/vision-conflict-detector.js";
import type { VisionContext } from "../../src/orchestrator/types.js";
import type { AdjudicationContext } from "../../src/adjudication/types.js";
import { mockArchitectureConflictIssue } from "../orchestrator/fixtures/mock-issues.js";
import { mockMissionDocument } from "../orchestrator/fixtures/mock-mission.js";

describe("Multi-AI Adjudication Integration", () => {
	const conflictDetector = new DefaultVisionConflictDetector();
	const adjudicator = new DefaultMultiAIAdjudicator();

	describe("End-to-end adjudication flow", () => {
		it("should complete full flow from conflict detection to winning proposal", async () => {
			// Step 1: Detect conflict
			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			// Architecture conflict should be detected (level may vary based on keywords)
			expect(conflictResult.conflictLevel).not.toBe("none");

			// Step 2: Execute adjudication
			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const adjudicationResult = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			// Step 3: Verify result
			expect(adjudicationResult.outcome).not.toBe("error");
			expect(adjudicationResult.allProposals).toHaveLength(3);
			expect(adjudicationResult.rounds).toHaveLength(3);

			// Verify winning proposal (if not deadlock)
			if (adjudicationResult.outcome !== "deadlock") {
				expect(adjudicationResult.winner).toBeDefined();
				expect(adjudicationResult.winner?.votes).toBeGreaterThan(0);
			}
		});

		it("should provide actionable reasoning for human review", async () => {
			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const adjudicationResult = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			// Reasoning should be clear and actionable
			expect(adjudicationResult.reasoning).toBeTruthy();
			expect(adjudicationResult.reasoning.length).toBeGreaterThan(10);
		});

		it("should maintain proposal traceability through all rounds", async () => {
			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			// Verify same proposal IDs across all rounds
			const round1Proposals = result.rounds[0].outputs as Array<{ id: string }>;
			const proposalIds = new Set(round1Proposals.map((p) => p.id));

			// Round 2 reviews should reference these proposal IDs
			const round2Reviews = result.rounds[1].outputs as Array<{
				approvals: string[];
				rejections: string[];
			}>;
			for (const review of round2Reviews) {
				for (const id of [...review.approvals, ...review.rejections]) {
					expect(proposalIds.has(id)).toBe(true);
				}
			}

			// Round 3 votes should reference these proposal IDs
			const round3Votes = result.rounds[2].outputs as Array<{
				votedFor: string;
			}>;
			for (const vote of round3Votes) {
				expect(proposalIds.has(vote.votedFor)).toBe(true);
			}
		});
	});

	describe("Scenario: Minor conflict with quick resolution", () => {
		it("should resolve minor conflicts efficiently", async () => {
			// Create a minor conflict issue
			const minorIssue = {
				...mockArchitectureConflictIssue,
				id: "ISSUE-100",
				description: "密码加密算法可以优化",
				context: "当前使用 bcrypt，建议改为 Argon2",
			};

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				minorIssue,
				visionContext,
			);

			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				minorIssue,
				adjudicationContext,
			);

			expect(result.outcome).not.toBe("error");
			expect(result.rounds).toHaveLength(3);
		});
	});

	describe("Scenario: Major conflict requiring careful deliberation", () => {
		it("should handle major conflicts with full three-round process", async () => {
			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			// Architecture conflict should be detected
			expect(conflictResult.conflictLevel).not.toBe("none");

			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 5, // Use max participants for major conflicts
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			// Should complete all three rounds
			expect(result.rounds).toHaveLength(3);
			expect(result.allProposals).toHaveLength(5);

			// Each proposal should have been reviewed
			const reviews = result.rounds[1].outputs as Array<{
				approvals: string[];
				rejections: string[];
			}>;
			expect(reviews).toHaveLength(5);
		});
	});

	describe("Scenario: Deadlock requiring human intervention", () => {
		it("should clearly signal when human intervention is needed", async () => {
			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			// If deadlock occurs, verify proper signaling
			if (result.outcome === "deadlock") {
				expect(result.winner).toBeUndefined();
				expect(result.reasoning).toContain("人工");
				expect(result.allProposals.length).toBeGreaterThan(0);
			}
		});
	});

	describe("Integration with conflict detection result", () => {
		it("should incorporate conflict details into adjudication", async () => {
			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			const adjudicationContext: AdjudicationContext = {
				missionDocument: mockMissionDocument,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			// Verify adjudication used conflict context
			expect(result.allProposals.length).toBeGreaterThan(0);

			// Proposals should consider the conflict level
			for (const proposal of result.allProposals) {
				expect(proposal.solution).toBeTruthy();
				expect(proposal.reasoning).toBeTruthy();
			}
		});

		it("should handle edge case with minimal mission document", async () => {
			const minimalMission = {
				name: "Minimal Mission",
				background: ["背景1", "背景2", "背景3"],
				goal: "实现功能",
				boundaries: {
					inScope: ["A"],
					outOfScope: ["B"],
				},
				successCriteria: ["标准1"],
				architectureConstraints: ["约束1"],
				risks: [{ description: "风险1" }],
				rawMarkdown: "",
			};

			const visionContext: VisionContext = {
				missionDocument: minimalMission,
			};

			const conflictResult = await conflictDetector.detect(
				mockArchitectureConflictIssue,
				visionContext,
			);

			const adjudicationContext: AdjudicationContext = {
				missionDocument: minimalMission,
				conflictDetails: conflictResult,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				adjudicationContext,
			);

			expect(result.outcome).not.toBe("error");
			expect(result.rounds).toHaveLength(3);
		});
	});
});
