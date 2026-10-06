/**
 * Mission Document type definitions
 *
 * Represents the parsed structure of mission.md files.
 * Based on ADR-0003 contract format specification.
 */

/**
 * Parsed structure of mission.md after validation.
 *
 * This is the source of truth for mission intent, derived from
 * the mission.md markdown file through parsing and validation.
 */
export interface MissionDocument {
	/** Mission name extracted from heading */
	name: string;

	/** Background section - at least 3 sentences */
	background: string[];

	/** Goal - single sentence describing what to achieve */
	goal: string;

	/** Boundary - in-scope and out-of-scope items */
	boundaries: {
		inScope: string[];
		outOfScope: string[];
	};

	/** Success criteria - verifiable standards */
	successCriteria: string[];

	/** Architecture constraints */
	architectureConstraints: string[];

	/** Risks with optional impact and mitigation */
	risks: Array<{
		description: string;
		impact?: string;
		mitigation?: string;
	}>;

	/** Original markdown content */
	rawMarkdown: string;
}

/**
 * Validation result for mission.md
 *
 * Contains specific violations for ADR-0003 quality gates.
 */
export interface ValidationResult {
	/** Whether the mission document passes all quality gates */
	valid: boolean;

	/** List of validation violations */
	violations: Array<{
		/** Field that failed validation */
		field: string;
		/** Validation rule that was violated */
		rule: string;
		/** Human-readable error message */
		message: string;
	}>;
}
