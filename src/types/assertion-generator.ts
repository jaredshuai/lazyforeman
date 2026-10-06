/**
 * Assertion Generator type definitions
 *
 * Types for assertion generation results from the Investigator Agent.
 */

import type { Assertion } from "./assertion.js";

/**
 * Assertion generation result
 *
 * Contains generated assertions and metadata about the generation process.
 */
export interface AssertionGenerationResult {
	/** Generated assertions */
	assertions: Assertion[];

	/** Generation metadata */
	metadata: {
		/** Total number of assertions generated */
		totalGenerated: number;

		/** Number of deterministic assertions */
		deterministicCount: number;

		/** Number of semantic assertions */
		semanticCount: number;

		/** Source document name */
		sourceDocument: string;

		/** Generation timestamp */
		generatedAt: string;
	};
}

/**
 * Assertion export format for assertions.json
 */
export interface AssertionExport {
	/** Exported assertions */
	assertions: Array<{
		id: string;
		description: string;
		status: string;
		type: string;
		sourceIndex: number;
		createdFrom: string;
	}>;

	/** Export metadata */
	metadata: {
		/** Mission ID */
		missionId: string;

		/** Total assertion count */
		totalCount: number;

		/** Export timestamp */
		exportedAt: string;
	};
}
