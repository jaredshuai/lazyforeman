/**
 * Grill Agent Type Definitions
 *
 * Types for the Grill-with-docs deep interview mechanism that
 * generates mission.md from rough goals through five-dimension drilling.
 *
 * Based on ADR-0003 §5 Grill-with-docs mechanism.
 */

/**
 * Grill conversation message
 */
export interface GrillMessage {
	/** Message role */
	role: "system" | "user" | "assistant";
	/** Message content */
	content: string;
	/** Message timestamp */
	timestamp: Date;
}

/**
 * Grill session options
 */
export interface GrillOptions {
	/** Maximum conversation turns (default: 10) */
	maxTurns?: number;
	/** Whether to call Wayfinder for architecture exploration (Phase 2.2) */
	useWayfinder?: boolean;
	/** Output path for generated mission.md (optional) */
	outputPath?: string;
}

/**
 * Grill session state
 */
export type GrillSessionStatus = "in_progress" | "completed" | "failed";

/**
 * Grill session record
 */
export interface GrillSession {
	/** Unique session ID */
	id: string;
	/** User's rough goal input */
	roughGoal: string;
	/** Generated mission.md content (null if not completed) */
	generatedMission: string | null;
	/** Conversation messages */
	messages: GrillMessage[];
	/** Session status */
	status: GrillSessionStatus;
	/** Creation timestamp */
	createdAt: Date;
	/** Completion timestamp (null if not completed) */
	completedAt: Date | null;
}

/**
 * Five dimensions for Grill drilling (ADR-0003 §5.2)
 */
export enum GrillDimension {
	/** Goal clarification: what problem, who uses it, success criteria */
	GOAL = "goal",
	/** Boundary confirmation: in-scope, out-of-scope, dependencies, known issues */
	BOUNDARY = "boundary",
	/** Technical constraints: existing architecture, tech debt, performance/security */
	TECHNICAL = "technical",
	/** Acceptance criteria refinement: verification methods, edge cases */
	ACCEPTANCE = "acceptance",
	/** Risk identification: potential problems, uncertainties, pre-research needs */
	RISK = "risk",
}

/**
 * Grill dimension drill result
 */
export interface DimensionDrillResult {
	/** Dimension that was drilled */
	dimension: GrillDimension;
	/** User responses collected */
	responses: string[];
	/** Whether this dimension is complete */
	complete: boolean;
}

/**
 * Complete Grill drill results for all five dimensions
 */
export interface GrillDrillResults {
	goal: DimensionDrillResult;
	boundary: DimensionDrillResult;
	technical: DimensionDrillResult;
	acceptance: DimensionDrillResult;
	risk: DimensionDrillResult;
}
