/**
 * Multi-AI Adjudicator implementation (feat-011)
 *
 * Implements three-round adjudication process per ADR-0003 §6.2
 * Integrated with decision archiving (feat-012)
 * Phase 2.2: Mock implementation (no real LLM calls)
 */

import type { DiscoveredIssue } from "../types/handoff.js";
import type {
	AdjudicationContext,
	AdjudicationOutcome,
	AdjudicationResult,
	AdjudicationRound,
	MultiAIAdjudicator,
	Proposal,
	Review,
	Vote,
} from "./types.js";
import type { DecisionArchive } from "./archive.js";

/**
 * Default implementation of Multi-AI Adjudicator
 */
export class DefaultMultiAIAdjudicator implements MultiAIAdjudicator {
	constructor(private readonly archive?: DecisionArchive) {}

	async adjudicate(
		issue: DiscoveredIssue,
		context: AdjudicationContext,
	): Promise<AdjudicationResult> {
		const startTime = new Date();

		// Validate participant count (3-5)
		if (context.participants < 3 || context.participants > 5) {
			return {
				outcome: "error",
				allProposals: [],
				rounds: [],
				reasoning: `Invalid participant count: ${context.participants}. Must be between 3 and 5.`,
			};
		}

		const rounds: AdjudicationRound[] = [];

		try {
			// Round 1: Independent proposals (3+ AIs, independent)
			const proposals = await this.round1_IndependentProposals(issue, context);
			rounds.push({
				round: 1,
				type: "independent_proposals",
				outputs: proposals,
			});

			// Round 2: Peer review (each must approve ≥1, reject ≥1)
			const reviews = await this.round2_PeerReview(proposals);
			rounds.push({
				round: 2,
				type: "peer_review",
				outputs: reviews,
			});

			// Round 3: Revised voting
			const votes = await this.round3_RevisedVoting(proposals, reviews);
			rounds.push({
				round: 3,
				type: "revised_voting",
				outputs: votes,
			});

			// Determine outcome
			const outcome = this.determineOutcome(votes);
			const winner = this.selectWinner(proposals, votes);

			const result: AdjudicationResult = {
				outcome,
				winner,
				allProposals: proposals,
				rounds,
				reasoning: this.generateReasoning(outcome, winner, votes),
			};

			// Archive the decision (feat-012)
			if (this.archive) {
				const archivePath = await this.archive.archive(
					context.missionDocument.name,
					issue,
					result,
					startTime,
				);
				console.log(`[Adjudication] Decision archived to: ${archivePath}`);
			}

			return result;
		} catch (error) {
			return {
				outcome: "error",
				allProposals: [],
				rounds,
				reasoning: `Adjudication failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Round 1: Independent proposals
	 */
	private async round1_IndependentProposals(
		issue: DiscoveredIssue,
		context: AdjudicationContext,
	): Promise<Proposal[]> {
		const proposals: Proposal[] = [];

		for (let i = 0; i < context.participants; i++) {
			const participantId = `AI-${i + 1}`;

			// Phase 2.2: Mock proposal generation
			const proposal = await this.generateProposal(
				participantId,
				issue,
				context,
				i,
			);

			proposals.push({
				id: `P${i + 1}`,
				participantId,
				solution: proposal.solution,
				reasoning: proposal.reasoning,
				votes: 0,
			});
		}

		return proposals;
	}

	/**
	 * Round 2: Peer review
	 */
	private async round2_PeerReview(proposals: Proposal[]): Promise<Review[]> {
		const reviews: Review[] = [];

		for (const reviewer of proposals) {
			const otherProposals = proposals.filter((p) => p.id !== reviewer.id);

			// Generate review (must approve ≥1, reject ≥1)
			const review = await this.generateReview(
				reviewer.participantId,
				otherProposals,
			);

			reviews.push(review);
		}

		return reviews;
	}

	/**
	 * Round 3: Revised voting
	 */
	private async round3_RevisedVoting(
		proposals: Proposal[],
		reviews: Review[],
	): Promise<Vote[]> {
		const votes: Vote[] = [];

		for (const proposal of proposals) {
			// Each participant votes based on proposals and reviews
			const vote = await this.castVote(
				proposal.participantId,
				proposals,
				reviews,
			);

			votes.push(vote);
		}

		// Tally votes
		for (const vote of votes) {
			const targetProposal = proposals.find((p) => p.id === vote.votedFor);
			if (targetProposal) {
				targetProposal.votes += 1;
			}
		}

		return votes;
	}

	/**
	 * Determine adjudication outcome
	 */
	private determineOutcome(votes: Vote[]): AdjudicationOutcome {
		const voteDistribution = this.getVoteDistribution(votes);
		const maxVotes = Math.max(...Object.values(voteDistribution));
		const totalVotes = votes.length;

		// Consensus: all votes for same proposal
		if (maxVotes === totalVotes) {
			return "consensus";
		}

		// Majority: more than 50% of votes
		if (maxVotes > totalVotes / 2) {
			return "majority";
		}

		// Deadlock: no majority
		return "deadlock";
	}

	/**
	 * Select winning proposal
	 */
	private selectWinner(
		proposals: Proposal[],
		votes: Vote[],
	): Proposal | undefined {
		// Sort by votes (descending)
		const sorted = [...proposals].sort((a, b) => b.votes - a.votes);

		// If top proposal has strictly more votes than second, return it
		if (sorted[0].votes > (sorted[1]?.votes ?? 0)) {
			return sorted[0];
		}

		// Tie for first place - deadlock
		return undefined;
	}

	/**
	 * Get vote distribution
	 */
	private getVoteDistribution(votes: Vote[]): Record<string, number> {
		const distribution: Record<string, number> = {};

		for (const vote of votes) {
			distribution[vote.votedFor] = (distribution[vote.votedFor] ?? 0) + 1;
		}

		return distribution;
	}

	/**
	 * Generate reasoning summary
	 */
	private generateReasoning(
		outcome: AdjudicationOutcome,
		winner: Proposal | undefined,
		votes: Vote[],
	): string {
		if (outcome === "consensus") {
			return `全体一致通过方案 ${winner?.id}`;
		}

		if (outcome === "majority") {
			return `多数投票通过方案 ${winner?.id}（${winner?.votes}/${votes.length} 票）`;
		}

		if (outcome === "deadlock") {
			return `未能达成多数共识，需要人工裁决`;
		}

		return `裁决过程出错`;
	}

	/**
	 * Mock proposal generation (Phase 2.2)
	 */
	private async generateProposal(
		participantId: string,
		issue: DiscoveredIssue,
		context: AdjudicationContext,
		index: number,
	): Promise<{ solution: string; reasoning: string }> {
		// Phase 2.2: Generate diverse mock proposals based on participant index
		const solutions = [
			{
				solution: `${issue.suggestedFix || "采用原有系统的方案"}`,
				reasoning: `保持与现有系统一致，降低集成风险`,
			},
			{
				solution: `${issue.suggestedFix || "采用 mission 要求的方案"}`,
				reasoning: `严格遵循 mission 文档的架构约束`,
			},
			{
				solution: `支持两种方案的兼容模式`,
				reasoning: `提供灵活性，逐步迁移`,
			},
			{
				solution: `重新设计架构以解决根本问题`,
				reasoning: `从根本上避免冲突`,
			},
			{
				solution: `先临时采用现有方案，规划长期迁移`,
				reasoning: `平衡短期交付和长期目标`,
			},
		];

		return solutions[index % solutions.length];
	}

	/**
	 * Mock review generation (Phase 2.2)
	 */
	private async generateReview(
		reviewerId: string,
		proposals: Proposal[],
	): Promise<Review> {
		// Phase 2.2: Mock review logic
		// Approve first proposal, reject second proposal
		const approvals: string[] = [];
		const rejections: string[] = [];

		if (proposals.length >= 1) {
			approvals.push(proposals[0].id);
		}

		if (proposals.length >= 2) {
			rejections.push(proposals[1].id);
		}

		return {
			reviewerId,
			approvals,
			rejections,
			reasoning: `基于技术可行性和风险评估，${approvals.join(", ")} 方案更可取`,
		};
	}

	/**
	 * Mock vote casting (Phase 2.2)
	 */
	private async castVote(
		voterId: string,
		proposals: Proposal[],
		reviews: Review[],
	): Promise<Vote> {
		// Phase 2.2: Vote for proposal with most approvals
		const approvalCounts = new Map<string, number>();

		for (const review of reviews) {
			for (const approvedId of review.approvals) {
				approvalCounts.set(
					approvedId,
					(approvalCounts.get(approvedId) ?? 0) + 1,
				);
			}
		}

		// Find proposal with most approvals
		let maxApprovals = 0;
		let mostApproved = proposals[0].id;

		for (const proposal of proposals) {
			const count = approvalCounts.get(proposal.id) ?? 0;
			if (count > maxApprovals) {
				maxApprovals = count;
				mostApproved = proposal.id;
			}
		}

		return {
			voterId,
			votedFor: mostApproved,
			reasoning: `该方案获得了最多同行认可（${maxApprovals} 票），技术风险最低`,
		};
	}
}
