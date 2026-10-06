/**
 * Mock data for decision archive testing
 */

import type {
	AdjudicationResult,
	AdjudicationRound,
	Proposal,
	Review,
	Vote,
} from "../../../src/adjudication/types.js";
import type {
	ArchivedDecision,
	DecisionMetadata,
} from "../../../src/adjudication/archive.js";
import type { DiscoveredIssue } from "../../../src/types/handoff.js";

/**
 * Mock proposals
 */
export const mockProposals: Proposal[] = [
	{
		id: "P1",
		participantId: "AI-1",
		solution: "Use RSA private key signing to maintain consistency",
		reasoning:
			"Existing authentication system already uses RSA, this approach minimizes changes",
		votes: 2,
	},
	{
		id: "P2",
		participantId: "AI-2",
		solution: "Use symmetric key encryption for simplicity",
		reasoning: "Symmetric keys are easier to manage and rotate",
		votes: 1,
	},
	{
		id: "P3",
		participantId: "AI-3",
		solution: "Use HMAC-SHA256 for JWT signing",
		reasoning: "HMAC provides good security with simpler implementation",
		votes: 0,
	},
];

/**
 * Mock reviews
 */
export const mockReviews: Review[] = [
	{
		reviewerId: "AI-1",
		approvals: ["P2"],
		rejections: ["P3"],
		reasoning: "P2 is simple but P3 lacks consistency with existing system",
	},
	{
		reviewerId: "AI-2",
		approvals: ["P1"],
		rejections: ["P3"],
		reasoning: "P1 maintains consistency, P3 introduces new patterns",
	},
	{
		reviewerId: "AI-3",
		approvals: ["P1"],
		rejections: ["P2"],
		reasoning: "P1 is most compatible, P2 requires significant refactoring",
	},
];

/**
 * Mock votes
 */
export const mockVotes: Vote[] = [
	{
		voterId: "AI-1",
		votedFor: "P1",
		reasoning: "After review, RSA consistency is most important",
	},
	{
		voterId: "AI-2",
		votedFor: "P2",
		reasoning: "Simplicity outweighs consistency concerns",
	},
	{
		voterId: "AI-3",
		votedFor: "P1",
		reasoning: "Consistency with existing system is critical",
	},
];

/**
 * Mock adjudication rounds
 */
export const mockRounds: AdjudicationRound[] = [
	{
		round: 1,
		type: "independent_proposals",
		outputs: mockProposals,
	},
	{
		round: 2,
		type: "peer_review",
		outputs: mockReviews,
	},
	{
		round: 3,
		type: "revised_voting",
		outputs: mockVotes,
	},
];

/**
 * Mock consensus result
 */
export const mockConsensusResult: AdjudicationResult = {
	outcome: "consensus",
	winner: mockProposals[0],
	allProposals: mockProposals,
	rounds: mockRounds,
	reasoning:
		"All participants agreed that maintaining consistency with existing RSA authentication is the best approach",
};

/**
 * Mock majority result
 */
export const mockMajorityResult: AdjudicationResult = {
	outcome: "majority",
	winner: mockProposals[0],
	allProposals: mockProposals,
	rounds: mockRounds,
	reasoning: "P1 received 2 votes vs 1 vote for P2, clear majority",
};

/**
 * Mock deadlock result
 */
export const mockDeadlockResult: AdjudicationResult = {
	outcome: "deadlock",
	winner: undefined,
	allProposals: mockProposals,
	rounds: mockRounds,
	reasoning:
		"No clear winner emerged, votes were split evenly. Human intervention required.",
};

/**
 * Mock discovered issue
 */
export const mockIssue: DiscoveredIssue = {
	id: "ISSUE-020",
	category: "architecture_conflict",
	severity: "blocking",
	description: "JWT signing method conflicts with existing authentication",
	context: "src/auth/jwt.ts - generateToken function",
	suggestedFix: "Align JWT signing with existing RSA authentication",
	discoveredAt: "2026-10-06T20:30:00.000Z",
};

/**
 * Mock decision metadata
 */
export const mockDecisionMetadata: DecisionMetadata = {
	missionId: "phase-2.2",
	issueId: "ISSUE-020",
	timestamp: "2026-10-06T20:30:00.000Z",
	participants: 3,
	duration: 15000, // 15 seconds
};

/**
 * Mock archived decision
 */
export const mockArchivedDecision: ArchivedDecision = {
	metadata: mockDecisionMetadata,
	rounds: mockRounds.map((r) => ({
		round: r.round,
		type: r.type,
		timestamp: new Date().toISOString(),
		outputs: r.outputs,
	})),
	outcome: mockConsensusResult,
};
