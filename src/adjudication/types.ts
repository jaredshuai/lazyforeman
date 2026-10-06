/**
 * Multi-AI Adjudication types (feat-011)
 *
 * Implements three-round adjudication process per ADR-0003 §6.2
 */

import type { DiscoveredIssue } from "../types/handoff.js";
import type { MissionDocument } from "../types/mission-document.js";
import type { ConflictDetectionResult } from "../orchestrator/types.js";

/**
 * Adjudication context
 */
export interface AdjudicationContext {
	/** Mission document */
	missionDocument: MissionDocument;
	/** Conflict detection details */
	conflictDetails: ConflictDetectionResult;
	/** Number of participants (3-5) */
	participants: number;
}

/**
 * Adjudication result
 */
export interface AdjudicationResult {
	/** Outcome of adjudication */
	outcome: AdjudicationOutcome;
	/** Winning proposal (if any) */
	winner?: Proposal;
	/** All proposals */
	allProposals: Proposal[];
	/** Details of each round */
	rounds: AdjudicationRound[];
	/** Summary reasoning */
	reasoning: string;
}

/**
 * Adjudication outcome
 */
export type AdjudicationOutcome =
	| "consensus" // All participants agree
	| "majority" // Majority vote winner
	| "deadlock" // No clear winner, needs human intervention
	| "error"; // Error during adjudication

/**
 * Proposal from a participant
 */
export interface Proposal {
	/** Proposal ID (P1, P2, P3...) */
	id: string;
	/** Participant ID (AI-1, AI-2...) */
	participantId: string;
	/** Solution description */
	solution: string;
	/** Reasoning for the solution */
	reasoning: string;
	/** Number of votes received (round 3) */
	votes: number;
}

/**
 * Adjudication round details
 */
export interface AdjudicationRound {
	/** Round number (1/2/3) */
	round: number;
	/** Type of round */
	type: RoundType;
	/** Outputs from this round */
	outputs: unknown[];
}

/**
 * Round type
 */
export type RoundType =
	| "independent_proposals" // Round 1: Independent proposals
	| "peer_review" // Round 2: Peer review
	| "revised_voting"; // Round 3: Revised voting

/**
 * Review from a participant
 */
export interface Review {
	/** Reviewer participant ID */
	reviewerId: string;
	/** Approved proposal IDs */
	approvals: string[];
	/** Rejected proposal IDs */
	rejections: string[];
	/** Reasoning for approvals/rejections */
	reasoning: string;
}

/**
 * Vote from a participant
 */
export interface Vote {
	/** Voter participant ID */
	voterId: string;
	/** Proposal ID voted for */
	votedFor: string;
	/** Reasoning for the vote */
	reasoning: string;
}

/**
 * Multi-AI Adjudicator interface
 */
export interface MultiAIAdjudicator {
	/**
	 * Execute three-round adjudication
	 *
	 * @param issue - Issue requiring adjudication
	 * @param context - Adjudication context
	 * @returns Adjudication result
	 */
	adjudicate(
		issue: DiscoveredIssue,
		context: AdjudicationContext,
	): Promise<AdjudicationResult>;
}
