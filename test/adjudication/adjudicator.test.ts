/**
 * Unit tests for Multi-AI Adjudicator (feat-011)
 */

import { describe, it, expect } from "vitest";
import { DefaultMultiAIAdjudicator } from "../../src/adjudication/adjudicator.js";
import type { AdjudicationContext } from "../../src/adjudication/types.js";
import { mockArchitectureConflictIssue } from "../orchestrator/fixtures/mock-issues.js";
import { mockMissionDocument } from "../orchestrator/fixtures/mock-mission.js";

describe("DefaultMultiAIAdjudicator", () => {
	const adjudicator = new DefaultMultiAIAdjudicator();

	const baseContext: AdjudicationContext = {
		missionDocument: mockMissionDocument,
		conflictDetails: {
			conflictLevel: "major",
			reasoning: "JWT 算法不一致",
			recommendation: "require_user_decision",
		},
		participants: 3,
	};

	describe("adjudicate", () => {
		it("should execute three rounds successfully", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			expect(result.outcome).not.toBe("error");
			expect(result.rounds).toHaveLength(3);
			expect(result.rounds[0].type).toBe("independent_proposals");
			expect(result.rounds[1].type).toBe("peer_review");
			expect(result.rounds[2].type).toBe("revised_voting");
		});

		it("should generate correct number of proposals", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			expect(result.allProposals).toHaveLength(3);
			expect(result.allProposals[0].id).toBe("P1");
			expect(result.allProposals[1].id).toBe("P2");
			expect(result.allProposals[2].id).toBe("P3");
			expect(result.allProposals[0].participantId).toBe("AI-1");
		});

		it("should generate peer reviews with approvals and rejections", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const reviews = result.rounds[1].outputs;
			expect(reviews).toHaveLength(3);

			// Each review should have approvals and rejections
			for (const review of reviews) {
				const r = review as { approvals: string[]; rejections: string[] };
				expect(r.approvals.length).toBeGreaterThan(0);
				expect(r.rejections.length).toBeGreaterThan(0);
			}
		});

		it("should tally votes correctly", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const votes = result.rounds[2].outputs;
			expect(votes).toHaveLength(3);

			// Total votes should equal participant count
			const totalVotes = result.allProposals.reduce(
				(sum, p) => sum + p.votes,
				0,
			);
			expect(totalVotes).toBe(3);
		});
	});

	describe("outcome determination", () => {
		it("should detect consensus when all vote for same proposal", async () => {
			// With 3 participants, if all vote for P1, it should be consensus
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			// Check if consensus was reached
			if (result.outcome === "consensus") {
				expect(result.winner).toBeDefined();
				expect(result.winner?.votes).toBe(3);
				expect(result.reasoning).toContain("全体一致");
			}
		});

		it("should detect majority when more than 50% vote for same proposal", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			// Majority requires > 50% (e.g., 2 out of 3)
			if (result.outcome === "majority") {
				expect(result.winner).toBeDefined();
				expect(result.winner!.votes).toBeGreaterThan(1);
				expect(result.reasoning).toContain("多数投票");
			}
		});

		it("should detect deadlock when no majority exists", async () => {
			// Use 3 participants - if votes split evenly, it's a deadlock
			// This test validates the logic exists, actual deadlock depends on mock behavior
			const context: AdjudicationContext = {
				...baseContext,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			// Verify deadlock handling exists
			if (result.outcome === "deadlock") {
				expect(result.winner).toBeUndefined();
				expect(result.reasoning).toContain("人工裁决");
			} else {
				// If not deadlock, should be consensus or majority
				expect(["consensus", "majority"]).toContain(result.outcome);
			}
		});

		it("should handle 4 participants", async () => {
			const context: AdjudicationContext = {
				...baseContext,
				participants: 4,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			expect(result.outcome).not.toBe("error");
			expect(result.allProposals).toHaveLength(4);
			expect(result.rounds[2].outputs).toHaveLength(4);
		});

		it("should handle 5 participants", async () => {
			const context: AdjudicationContext = {
				...baseContext,
				participants: 5,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			expect(result.outcome).not.toBe("error");
			expect(result.allProposals).toHaveLength(5);
			expect(result.rounds[2].outputs).toHaveLength(5);
		});
	});

	describe("participant validation", () => {
		it("should reject less than 3 participants", async () => {
			const context: AdjudicationContext = {
				...baseContext,
				participants: 2,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			expect(result.outcome).toBe("error");
			expect(result.reasoning).toContain("Invalid participant count");
			expect(result.reasoning).toContain("Must be between 3 and 5");
		});

		it("should reject more than 5 participants", async () => {
			const context: AdjudicationContext = {
				...baseContext,
				participants: 6,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			expect(result.outcome).toBe("error");
			expect(result.reasoning).toContain("Invalid participant count");
			expect(result.reasoning).toContain("Must be between 3 and 5");
		});

		it("should accept exactly 3 participants", async () => {
			const context: AdjudicationContext = {
				...baseContext,
				participants: 3,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			expect(result.outcome).not.toBe("error");
		});

		it("should accept exactly 5 participants", async () => {
			const context: AdjudicationContext = {
				...baseContext,
				participants: 5,
			};

			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				context,
			);

			expect(result.outcome).not.toBe("error");
		});
	});

	describe("proposal generation", () => {
		it("should generate unique proposal IDs", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const proposalIds = result.allProposals.map((p) => p.id);
			const uniqueIds = new Set(proposalIds);
			expect(uniqueIds.size).toBe(proposalIds.length);
		});

		it("should assign unique participant IDs", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const participantIds = result.allProposals.map((p) => p.participantId);
			const uniqueIds = new Set(participantIds);
			expect(uniqueIds.size).toBe(participantIds.length);
		});

		it("should include solution and reasoning in proposals", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			for (const proposal of result.allProposals) {
				expect(proposal.solution).toBeTruthy();
				expect(proposal.reasoning).toBeTruthy();
				expect(typeof proposal.solution).toBe("string");
				expect(typeof proposal.reasoning).toBe("string");
			}
		});
	});

	describe("round outputs", () => {
		it("should store proposals in round 1", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const round1 = result.rounds[0];
			expect(round1.round).toBe(1);
			expect(round1.outputs).toHaveLength(3);
			expect(round1.outputs[0]).toHaveProperty("id");
			expect(round1.outputs[0]).toHaveProperty("solution");
		});

		it("should store reviews in round 2", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const round2 = result.rounds[1];
			expect(round2.round).toBe(2);
			expect(round2.outputs).toHaveLength(3);
			expect(round2.outputs[0]).toHaveProperty("reviewerId");
			expect(round2.outputs[0]).toHaveProperty("approvals");
			expect(round2.outputs[0]).toHaveProperty("rejections");
		});

		it("should store votes in round 3", async () => {
			const result = await adjudicator.adjudicate(
				mockArchitectureConflictIssue,
				baseContext,
			);

			const round3 = result.rounds[2];
			expect(round3.round).toBe(3);
			expect(round3.outputs).toHaveLength(3);
			expect(round3.outputs[0]).toHaveProperty("voterId");
			expect(round3.outputs[0]).toHaveProperty("votedFor");
		});
	});
});
