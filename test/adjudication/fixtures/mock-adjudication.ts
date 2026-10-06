/**
 * Mock data for adjudication testing (feat-011)
 */

import type {
	AdjudicationResult,
	Proposal,
	Review,
	Vote,
} from "../../../src/adjudication/types.js";

/**
 * Mock proposals
 */
export const mockProposals: Proposal[] = [
	{
		id: "P1",
		participantId: "AI-1",
		solution: "采用 RS256 算法",
		reasoning: "与现有系统保持一致",
		votes: 2,
	},
	{
		id: "P2",
		participantId: "AI-2",
		solution: "采用 HS256 算法",
		reasoning: "符合 mission 要求",
		votes: 1,
	},
	{
		id: "P3",
		participantId: "AI-3",
		solution: "支持两种算法",
		reasoning: "折中方案",
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
		reasoning: "P2 符合 mission 文档要求",
	},
	{
		reviewerId: "AI-2",
		approvals: ["P1"],
		rejections: ["P3"],
		reasoning: "P1 降低集成风险",
	},
	{
		reviewerId: "AI-3",
		approvals: ["P1"],
		rejections: ["P2"],
		reasoning: "P1 实现成本最低",
	},
];

/**
 * Mock votes
 */
export const mockVotes: Vote[] = [
	{
		voterId: "AI-1",
		votedFor: "P1",
		reasoning: "基于同行反馈，P1 更可行",
	},
	{
		voterId: "AI-2",
		votedFor: "P1",
		reasoning: "P1 获得最多认可",
	},
	{
		voterId: "AI-3",
		votedFor: "P2",
		reasoning: "P2 更符合长期目标",
	},
];

/**
 * Mock consensus result (all vote for same proposal)
 */
export const mockConsensusResult: AdjudicationResult = {
	outcome: "consensus",
	winner: mockProposals[0],
	allProposals: mockProposals,
	rounds: [
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
			outputs: [
				{ voterId: "AI-1", votedFor: "P1", reasoning: "Consensus" },
				{ voterId: "AI-2", votedFor: "P1", reasoning: "Consensus" },
				{ voterId: "AI-3", votedFor: "P1", reasoning: "Consensus" },
			],
		},
	],
	reasoning: "全体一致通过方案 P1",
};

/**
 * Mock majority result (majority vote, not unanimous)
 */
export const mockMajorityResult: AdjudicationResult = {
	outcome: "majority",
	winner: mockProposals[0],
	allProposals: mockProposals,
	rounds: [
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
	],
	reasoning: "多数投票通过方案 P1（2/3 票）",
};

/**
 * Mock deadlock result (no majority)
 */
export const mockDeadlockResult: AdjudicationResult = {
	outcome: "deadlock",
	winner: undefined,
	allProposals: mockProposals,
	rounds: [
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
			outputs: [
				{ voterId: "AI-1", votedFor: "P1", reasoning: "P1 best" },
				{ voterId: "AI-2", votedFor: "P2", reasoning: "P2 best" },
				{ voterId: "AI-3", votedFor: "P3", reasoning: "P3 best" },
			],
		},
	],
	reasoning: "未能达成多数共识，需要人工裁决",
};

/**
 * Mock error result
 */
export const mockErrorResult: AdjudicationResult = {
	outcome: "error",
	winner: undefined,
	allProposals: [],
	rounds: [],
	reasoning: "Invalid participant count: 2. Must be between 3 and 5.",
};
