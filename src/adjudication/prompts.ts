/**
 * AI prompt templates for multi-AI adjudication (feat-011)
 *
 * Phase 2.2: Mock implementation (no real LLM calls)
 */

import type { DiscoveredIssue } from "../types/handoff.js";
import type { AdjudicationContext } from "./types.js";

/**
 * Generate prompt for independent proposal (Round 1)
 */
export function generateProposalPrompt(
	issue: DiscoveredIssue,
	context: AdjudicationContext,
): string {
	return `You are an expert technical architect evaluating a discovered issue.

## Issue
- ID: ${issue.id}
- Category: ${issue.category}
- Description: ${issue.description}
- Context: ${issue.context}
- Suggested Fix: ${issue.suggestedFix || "None provided"}

## Mission Context
- Goal: ${context.missionDocument.goal}
- In Scope: ${context.missionDocument.boundaries.inScope.join(", ")}
- Out of Scope: ${context.missionDocument.boundaries.outOfScope.join(", ")}
- Architecture Constraints: ${context.missionDocument.architectureConstraints.join(", ")}

## Conflict Details
- Level: ${context.conflictDetails.conflictLevel}
- Reasoning: ${context.conflictDetails.reasoning}

## Task
Propose a solution that:
1. Resolves the issue
2. Aligns with mission goals and constraints
3. Is technically feasible
4. Minimizes disruption

Provide:
- Solution: Clear description of your proposed fix
- Reasoning: Why this solution is best`;
}

/**
 * Generate prompt for peer review (Round 2)
 */
export function generateReviewPrompt(
	reviewerId: string,
	proposals: Array<{ id: string; solution: string; reasoning: string }>,
): string {
	const proposalList = proposals
		.map(
			(p) =>
				`\n### ${p.id}\nSolution: ${p.solution}\nReasoning: ${p.reasoning}`,
		)
		.join("\n");

	return `You are ${reviewerId} reviewing peer proposals.

## Proposals to Review
${proposalList}

## Task
Review each proposal and:
1. Approve at least one proposal that you find technically sound
2. Reject at least one proposal with clear technical concerns
3. Provide reasoning for each decision

Provide:
- Approvals: List of proposal IDs you approve
- Rejections: List of proposal IDs you reject
- Reasoning: Explanation of your decisions`;
}

/**
 * Generate prompt for revised voting (Round 3)
 */
export function generateVotingPrompt(
	voterId: string,
	proposals: Array<{ id: string; solution: string; reasoning: string }>,
	reviews: Array<{
		reviewerId: string;
		approvals: string[];
		rejections: string[];
		reasoning: string;
	}>,
): string {
	const proposalList = proposals
		.map(
			(p) =>
				`\n### ${p.id}\nSolution: ${p.solution}\nReasoning: ${p.reasoning}`,
		)
		.join("\n");

	const reviewSummary = reviews
		.map(
			(r) =>
				`\n### ${r.reviewerId}\nApproved: ${r.approvals.join(", ")}\nRejected: ${r.rejections.join(", ")}\nReasoning: ${r.reasoning}`,
		)
		.join("\n");

	return `You are ${voterId} casting your final vote.

## All Proposals
${proposalList}

## Peer Reviews
${reviewSummary}

## Task
Based on the proposals and peer feedback:
1. Select ONE proposal to vote for
2. Explain why you chose this proposal
3. Consider technical merit, alignment with mission, and peer feedback

Provide:
- Voted For: Proposal ID
- Reasoning: Why you chose this proposal`;
}
