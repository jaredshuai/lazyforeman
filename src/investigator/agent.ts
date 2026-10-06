/**
 * Investigator Agent implementation
 *
 * Extracts validation assertions from MissionDocument success criteria.
 * Phase 2.1 implementation uses simple rule-based classification.
 */

import fs from "node:fs/promises";
import type { MissionDocument } from "../types/mission-document.js";
import type { Assertion } from "../types/assertion.js";
import type {
	AssertionGenerationResult,
	AssertionExport,
} from "../types/assertion-generator.js";
import type { SqliteDb } from "../db/connection.js";
import type { WayfinderClient } from "../wayfinder/client.js";

/**
 * Investigator Agent interface
 *
 * Responsibility: Extract validation assertions from mission.md
 */
export interface InvestigatorAgent {
	/**
	 * Extract assertions from mission document
	 *
	 * @param mission - Parsed mission document
	 * @returns Generation result with assertions and metadata
	 */
	extractAssertions(
		mission: MissionDocument,
	): Promise<AssertionGenerationResult>;

	/**
	 * Save assertions to database
	 *
	 * @param missionId - Mission ID
	 * @param assertions - Assertion list
	 */
	saveAssertions(missionId: string, assertions: Assertion[]): Promise<void>;

	/**
	 * Save mission metadata to database
	 *
	 * @param missionId - Mission ID
	 * @param mission - Mission document
	 */
	saveMissionMetadata(
		missionId: string,
		mission: MissionDocument,
	): Promise<void>;
}

/**
 * Default Investigator Agent implementation
 *
 * Phase 2.1 simplified version:
 * - Extracts from successCriteria (one-to-one mapping)
 * - Assertion ID format: VAL-001, VAL-002, ...
 * - Type classification: keyword-based rules
 * - Phase 2.2 will enhance: LLM refinement, Wayfinder feasibility checks
 */
export class DefaultInvestigatorAgent implements InvestigatorAgent {
	private readonly db: SqliteDb;

	constructor(db: SqliteDb, _wayfinder?: WayfinderClient) {
		this.db = db;
		// _wayfinder reserved for Phase 2.2 enhancements
	}

	async extractAssertions(
		mission: MissionDocument,
	): Promise<AssertionGenerationResult> {
		const assertions: Assertion[] = [];
		const now = new Date().toISOString();

		for (let i = 0; i < mission.successCriteria.length; i++) {
			const criterion = mission.successCriteria[i];

			// Generate assertion ID (VAL-001, VAL-002, ...)
			const id = `VAL-${String(i + 1).padStart(3, "0")}`;

			// Classify assertion type
			const type = this.classifyAssertionType(criterion);

			// Create assertion
			const assertion: Assertion = {
				id,
				description: criterion,
				status: "pending",
				type,
				sourceIndex: i,
				createdFrom: "mission.md",
				createdAt: now,
				updatedAt: now,
			};

			assertions.push(assertion);
		}

		// Count types
		const deterministicCount = assertions.filter(
			(a) => a.type === "deterministic",
		).length;
		const semanticCount = assertions.filter(
			(a) => a.type === "semantic",
		).length;

		return {
			assertions,
			metadata: {
				totalGenerated: assertions.length,
				deterministicCount,
				semanticCount,
				sourceDocument: "mission.md",
				generatedAt: now,
			},
		};
	}

	/**
	 * Classify assertion type using keyword-based rules
	 *
	 * Phase 2.1 simple rules:
	 * - Contains "test", "verify", "pass", "execute" → deterministic
	 * - Contains "user", "interface", "experience" → semantic
	 * - Default → semantic (conservative strategy, requires manual validation)
	 *
	 * Uses word boundary matching to avoid false positives (e.g., "checkout" shouldn't match "check")
	 *
	 * @param criterion - Success criterion text
	 * @returns Assertion type
	 */
	private classifyAssertionType(
		criterion: string,
	): "deterministic" | "semantic" {
		const lower = criterion.toLowerCase();

		// Deterministic: automated testing/validation keywords
		const deterministicPatterns = [
			/\btests?\b/,
			/\bverif(y|ies|ied)\b/,
			/\bpass(es|ed)?\b/,
			/\bexecute[sd]?\b/,
			/\b测试\b/,
			/\b验证\b/,
			/\b通过\b/,
			/\b执行\b/,
			/\b运行\b/,
			/\bruns?\b/,
			/\bvalidate[sd]?\b/,
			/\bcompile[sd]?\b/,
			/\bbuild[sd]?\b/,
			/\bsucceed[sd]?\b/,
		];

		// Semantic: UX/design/subjective keywords
		const semanticPatterns = [
			/\buser[s]?\b/,
			/\binterface[s]?\b/,
			/\bexperience[s]?\b/,
			/\b用户\b/,
			/\b界面\b/,
			/\b体验\b/,
			/\bui\b/,
			/\bux\b/,
			/\bdesign[s]?\b/,
			/\blayout[s]?\b/,
			/\bstyle[s]?\b/,
			/\bappearance[s]?\b/,
			/\bfeel[s]?\b/,
			/\bintuitive\b/,
			/\bprofessional\b/,
			/\bclear\b/,
			/\bhelpful\b/,
			/\baccessible\b/,
			/\b易用\b/,
			/\b美观\b/,
		];

		// Check deterministic patterns first (higher priority)
		for (const pattern of deterministicPatterns) {
			if (pattern.test(lower)) {
				return "deterministic";
			}
		}

		// Check semantic patterns
		for (const pattern of semanticPatterns) {
			if (pattern.test(lower)) {
				return "semantic";
			}
		}

		// Default to semantic (conservative strategy)
		return "semantic";
	}

	async saveAssertions(
		missionId: string,
		assertions: Assertion[],
	): Promise<void> {
		const insertStmt = this.db.prepare(`
      INSERT INTO assertions (
        id, description, status, type, mission_id,
        source_index, created_from, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

		for (const assertion of assertions) {
			insertStmt.run(
				assertion.id,
				assertion.description,
				assertion.status,
				assertion.type ?? "semantic",
				missionId,
				assertion.sourceIndex ?? null,
				assertion.createdFrom ?? "mission.md",
				assertion.createdAt,
				assertion.updatedAt,
			);
		}
	}

	async saveMissionMetadata(
		missionId: string,
		mission: MissionDocument,
	): Promise<void> {
		this.db
			.prepare(
				`
      INSERT INTO missions_metadata (
        mission_id, background_json, goal, boundaries_json,
        success_criteria_json, architecture_constraints_json,
        risks_json, raw_markdown, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
			)
			.run(
				missionId,
				JSON.stringify(mission.background),
				mission.goal,
				JSON.stringify(mission.boundaries),
				JSON.stringify(mission.successCriteria),
				JSON.stringify(mission.architectureConstraints),
				JSON.stringify(mission.risks),
				mission.rawMarkdown,
			);
	}
}

/**
 * Export assertions to assertions.json file
 *
 * @param missionId - Mission ID
 * @param db - Database connection
 * @param outputPath - Output file path
 */
export async function exportAssertionsJson(
	missionId: string,
	db: SqliteDb,
	outputPath: string,
): Promise<void> {
	const assertions = db
		.prepare(
			`
    SELECT id, description, status, type, source_index, created_from
    FROM assertions
    WHERE mission_id = ?
    ORDER BY source_index ASC
  `,
		)
		.all(missionId) as Array<{
		id: string;
		description: string;
		status: string;
		type: string;
		source_index: number;
		created_from: string;
	}>;

	const exportData: AssertionExport = {
		assertions: assertions.map((a) => ({
			id: a.id,
			description: a.description,
			status: a.status,
			type: a.type,
			sourceIndex: a.source_index,
			createdFrom: a.created_from,
		})),
		metadata: {
			missionId,
			totalCount: assertions.length,
			exportedAt: new Date().toISOString(),
		},
	};

	await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), "utf-8");
}

/**
 * Factory function to create Investigator Agent
 *
 * @param db - Database connection
 * @param wayfinder - Optional Wayfinder client for Phase 2.2 enhancements
 * @returns Investigator Agent instance
 */
export function createInvestigatorAgent(
	db: SqliteDb,
	wayfinder?: WayfinderClient,
): InvestigatorAgent {
	return new DefaultInvestigatorAgent(db, wayfinder);
}
