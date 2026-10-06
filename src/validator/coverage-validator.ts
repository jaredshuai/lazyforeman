/**
 * Coverage Validator - Pre-work Hard Gate
 *
 * Enforces 100% assertion coverage before any feature execution begins.
 * Every assertion must be claimed by exactly one feature (ADR-0003 §4).
 */

import type { Assertion } from "../types/assertion.js";
import type { Feature } from "../types/feature.js";
import type { SqliteDb } from "../db/connection.js";

/**
 * Coverage validation result.
 *
 * Contains detailed information about assertion coverage status,
 * including specific violations that block execution.
 */
export interface CoverageValidationResult {
	/** Whether validation passed (100% coverage with no violations) */
	passed: boolean;

	/** Total number of assertions in the mission */
	totalAssertions: number;

	/** Number of assertions claimed by exactly one feature */
	claimedAssertions: number;

	/** Coverage percentage (0-100) */
	coveragePercentage: number;

	/** Orphan assertions: not claimed by any feature */
	orphanAssertions: string[];

	/** Duplicate claims: claimed by multiple features */
	duplicateClaims: Map<string, string[]>;

	/** Timestamp when validation was performed */
	validatedAt: string;

	/** Type of validation performed */
	validationType: "pre_work" | "post_feature";
}

/**
 * Coverage Validator interface.
 *
 * Validates that every assertion is claimed by exactly one feature
 * before execution begins (pre-work hard gate).
 */
export interface CoverageValidator {
	/**
	 * Validate assertion coverage.
	 *
	 * Rules:
	 * 1. Every assertion must be claimed by exactly 1 feature
	 * 2. No orphan assertions (0 claimers)
	 * 3. No duplicate claims (2+ claimers)
	 *
	 * @param assertions - All assertions for the mission
	 * @param features - All features for the mission
	 * @returns Coverage validation result
	 */
	validate(
		assertions: Assertion[],
		features: Feature[],
	): CoverageValidationResult;

	/**
	 * Save validation result to database audit log.
	 *
	 * Persists the validation result to coverage_validations table
	 * for traceability and compliance auditing.
	 *
	 * @param missionId - Mission identifier
	 * @param result - Validation result to persist
	 */
	saveValidationResult(
		missionId: string,
		result: CoverageValidationResult,
	): Promise<void>;

	/**
	 * Generate human-readable coverage report.
	 *
	 * Produces a Markdown-formatted report with:
	 * - Coverage summary
	 * - List of orphan assertions (if any)
	 * - List of duplicate claims (if any)
	 * - Next steps to fix violations
	 *
	 * @param result - Validation result to format
	 * @returns Markdown-formatted report
	 */
	generateReport(result: CoverageValidationResult): string;
}

/**
 * Default Coverage Validator implementation.
 *
 * Implements strict 100% coverage validation with clear error reporting.
 */
export class DefaultCoverageValidator implements CoverageValidator {
	constructor(private readonly db: SqliteDb) {}

	validate(
		assertions: Assertion[],
		features: Feature[],
	): CoverageValidationResult {
		const assertionIds = new Set(assertions.map((a) => a.id));
		const claimMap = new Map<string, string[]>();

		// Build claim map: assertionId -> [featureIds]
		for (const feature of features) {
			const fulfills = feature.fulfills || [];
			for (const assertionId of fulfills) {
				if (!claimMap.has(assertionId)) {
					claimMap.set(assertionId, []);
				}
				const claimers = claimMap.get(assertionId);
				if (claimers) {
					claimers.push(feature.id);
				}
			}
		}

		// Detect orphan assertions (unclaimed)
		const orphanAssertions: string[] = [];
		for (const assertionId of assertionIds) {
			const claimers = claimMap.get(assertionId);
			if (!claimMap.has(assertionId) || !claimers || claimers.length === 0) {
				orphanAssertions.push(assertionId);
			}
		}

		// Detect duplicate claims (over-claimed)
		const duplicateClaims = new Map<string, string[]>();
		for (const [assertionId, featureIds] of claimMap) {
			if (featureIds.length > 1) {
				duplicateClaims.set(assertionId, featureIds);
			}
		}

		// Calculate coverage metrics
		const claimedAssertions =
			assertionIds.size - orphanAssertions.length - duplicateClaims.size;
		const coveragePercentage =
			assertionIds.size > 0 ? (claimedAssertions / assertionIds.size) * 100 : 0;

		// Validation passes only if 100% coverage with no violations
		const passed =
			orphanAssertions.length === 0 &&
			duplicateClaims.size === 0 &&
			assertionIds.size > 0;

		return {
			passed,
			totalAssertions: assertionIds.size,
			claimedAssertions,
			coveragePercentage,
			orphanAssertions,
			duplicateClaims,
			validatedAt: new Date().toISOString(),
			validationType: "pre_work",
		};
	}

	async saveValidationResult(
		missionId: string,
		result: CoverageValidationResult,
	): Promise<void> {
		const stmt = this.db.prepare(`
      INSERT INTO coverage_validations (
        mission_id, validation_type, total_assertions,
        claimed_assertions, orphan_assertions_json,
        duplicate_claims_json, passed, validated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

		// Handle both Map and plain object cases (plain object from journal deserialization)
		let duplicateClaimsArray: Array<[string, string[]]>;
		if (result.duplicateClaims instanceof Map) {
			duplicateClaimsArray = Array.from(result.duplicateClaims.entries());
		} else {
			// Plain object from JSON deserialization
			duplicateClaimsArray = Object.entries(
				result.duplicateClaims as Record<string, string[]>,
			);
		}

		stmt.run(
			missionId,
			result.validationType,
			result.totalAssertions,
			result.claimedAssertions,
			JSON.stringify(result.orphanAssertions),
			JSON.stringify(duplicateClaimsArray),
			result.passed ? 1 : 0,
			result.validatedAt,
		);
	}

	generateReport(result: CoverageValidationResult): string {
		let report = "# Assertion Coverage Validation Report\n\n";

		// Summary section
		report += "## Summary\n\n";
		report += `- **Status**: ${result.passed ? "✅ Passed" : "❌ Failed"}\n`;
		report += `- **Coverage**: ${result.coveragePercentage.toFixed(1)}%\n`;
		report += `- **Total Assertions**: ${result.totalAssertions}\n`;
		report += `- **Claimed**: ${result.claimedAssertions}\n`;
		report += `- **Validation Time**: ${result.validatedAt}\n\n`;

		// Orphan assertions section
		if (result.orphanAssertions.length > 0) {
			report += `## ⚠️ Orphan Assertions (${result.orphanAssertions.length})\n\n`;
			report += "The following assertions are not claimed by any feature:\n\n";
			for (const assertionId of result.orphanAssertions) {
				report += `- \`${assertionId}\`\n`;
			}
			report += "\n";
		}

		// Duplicate claims section
		if (result.duplicateClaims.size > 0) {
			report += `## ⚠️ Duplicate Claims (${result.duplicateClaims.size})\n\n`;
			report +=
				"The following assertions are claimed by multiple features:\n\n";
			for (const [assertionId, featureIds] of result.duplicateClaims) {
				report += `- \`${assertionId}\` claimed by ${featureIds.length} features:\n`;
				for (const featureId of featureIds) {
					report += `  - \`${featureId}\`\n`;
				}
			}
			report += "\n";
		}

		// Conclusion section
		if (result.passed) {
			report += "## ✅ Conclusion\n\n";
			report +=
				"All assertions are claimed by exactly one feature. Ready to start work.\n";
		} else {
			report += "## ❌ Conclusion\n\n";
			report +=
				"Coverage violations detected. Must fix before starting work.\n\n";
			report += "**Next Steps**:\n";
			if (result.orphanAssertions.length > 0) {
				report += "- Create or update features to claim orphan assertions\n";
			}
			if (result.duplicateClaims.size > 0) {
				report +=
					"- Remove duplicate claims so each assertion is claimed by exactly one feature\n";
			}
		}

		return report;
	}
}

/**
 * Factory function to create a Coverage Validator.
 *
 * @param db - SQLite database handle for audit logging
 * @returns Configured CoverageValidator instance
 */
export function createCoverageValidator(db: SqliteDb): CoverageValidator {
	return new DefaultCoverageValidator(db);
}
