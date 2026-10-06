/**
 * Planner Agent implementation
 *
 * Generates features from MissionDocument + Assertions and establishes dependency DAG.
 * Phase 2.1 implementation uses one-to-one mapping strategy.
 */

import fs from "node:fs/promises";
import type { MissionDocument } from "../types/mission-document.js";
import type { Assertion } from "../types/assertion.js";
import type { Feature } from "../types/feature.js";
import type { SqliteDb } from "../db/connection.js";
import type { WayfinderClient } from "../wayfinder/client.js";

/**
 * Feature generation strategy
 */
export type FeatureGenerationStrategy =
	| "one-to-one" // Phase 2.1: one assertion → one feature
	| "grouped"; // Phase 2.2: multiple assertions → one feature (LLM grouping)

/**
 * Planner Agent interface
 *
 * Responsibility: Generate features from assertions, establish dependency DAG
 */
export interface PlannerAgent {
	/**
	 * Generate features from mission and assertions
	 *
	 * @param missionId - Mission ID
	 * @param mission - Mission document
	 * @param assertions - Assertion list
	 * @returns Feature list
	 */
	generateFeatures(
		missionId: string,
		mission: MissionDocument,
		assertions: Assertion[],
	): Promise<Feature[]>;

	/**
	 * Save features to database
	 *
	 * @param missionId - Mission ID
	 * @param features - Feature list
	 */
	saveFeatures(missionId: string, features: Feature[]): Promise<void>;
}

/**
 * Feature export format for features.json
 */
export interface FeatureExport {
	/** Exported features */
	features: Array<{
		id: string;
		name: string;
		description: string;
		status: string;
		fulfills: string[];
		preconditions: string[];
	}>;

	/** Export metadata */
	metadata: {
		/** Mission ID */
		missionId: string;

		/** Total feature count */
		totalCount: number;

		/** Export timestamp */
		exportedAt: string;
	};
}

/**
 * Planner Agent default implementation
 *
 * Phase 2.1 simplified version:
 * - Strategy: one-to-one mapping (one assertion → one feature)
 * - Feature ID format: feat-001, feat-002, ...
 * - Dependency analysis: Phase 2.1 暂不实现（all preconditions are empty arrays）
 * - Phase 2.2 will enhance: LLM grouping, Wayfinder dependency analysis
 */
export class DefaultPlannerAgent implements PlannerAgent {
	constructor(
		private readonly db: SqliteDb,
		private readonly strategy: FeatureGenerationStrategy = "one-to-one",
		_wayfinder?: WayfinderClient,
	) {
		// _wayfinder reserved for Phase 2.2 enhancements
	}

	async generateFeatures(
		missionId: string,
		mission: MissionDocument,
		assertions: Assertion[],
	): Promise<Feature[]> {
		if (this.strategy === "one-to-one") {
			return this.generateOneToOneFeatures(missionId, mission, assertions);
		}

		throw new Error(`Unsupported strategy: ${this.strategy}`);
	}

	/**
	 * One-to-one strategy: one assertion → one feature
	 *
	 * Phase 2.1 simplified:
	 * - Feature name = assertion description (truncated)
	 * - Feature description = assertion + mission context
	 * - fulfills = [assertionId]
	 * - preconditions = [] (Phase 2.1 does not analyze dependencies)
	 */
	private generateOneToOneFeatures(
		missionId: string,
		mission: MissionDocument,
		assertions: Assertion[],
	): Feature[] {
		const features: Feature[] = [];

		for (let i = 0; i < assertions.length; i++) {
			const assertion = assertions[i];

			// Generate Feature ID (feat-001, feat-002, ...)
			const id = `feat-${String(i + 1).padStart(3, "0")}`;

			// Generate Feature name (simplified: truncate assertion description)
			const name = this.generateFeatureName(assertion);

			// Generate Feature description (includes context)
			const description = this.generateFeatureDescription(assertion, mission);

			// Create Feature
			const feature: Feature = {
				id,
				name,
				description,
				fulfills: [assertion.id],
				preconditions: [], // Phase 2.1 does not analyze dependencies
				status: "pending",
				missionId,
				currentWorkerSessionId: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			features.push(feature);
		}

		return features;
	}

	/**
	 * Generate Feature name
	 *
	 * Phase 2.1 simplified: truncate assertion to first 50 characters
	 */
	private generateFeatureName(assertion: Assertion): string {
		const maxLength = 50;
		const desc = assertion.description.trim();

		if (desc.length <= maxLength) {
			return desc;
		}

		return `${desc.substring(0, maxLength - 3)}...`;
	}

	/**
	 * Generate Feature description
	 *
	 * Phase 2.1 simplified:
	 * - Full assertion description
	 * - Add mission background context (first sentence)
	 * - Add relevant architecture constraints
	 */
	private generateFeatureDescription(
		assertion: Assertion,
		mission: MissionDocument,
	): string {
		let description = `实现断言：${assertion.description}\n\n`;

		// Add background context
		if (mission.background.length > 0) {
			description += `背景：${mission.background[0]}\n\n`;
		}

		// Add architecture constraints
		if (mission.architectureConstraints.length > 0) {
			description += `架构约束：\n`;
			for (const constraint of mission.architectureConstraints.slice(0, 3)) {
				description += `- ${constraint}\n`;
			}
		}

		return description.trim();
	}

	async saveFeatures(missionId: string, features: Feature[]): Promise<void> {
		const insertStmt = this.db.prepare(`
      INSERT INTO features (
        id, mission_id, name, description, status,
        fulfills, preconditions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

		for (const feature of features) {
			insertStmt.run(
				feature.id,
				missionId,
				feature.name,
				feature.description,
				feature.status,
				JSON.stringify(feature.fulfills),
				JSON.stringify(feature.preconditions),
				feature.createdAt,
				feature.updatedAt,
			);
		}
	}
}

/**
 * Export features to features.json file
 *
 * @param missionId - Mission ID
 * @param db - Database connection
 * @param outputPath - Output file path
 */
export async function exportFeaturesJson(
	missionId: string,
	db: SqliteDb,
	outputPath: string,
): Promise<void> {
	const features = db
		.prepare(
			`
    SELECT id, name, description, status, fulfills, preconditions
    FROM features
    WHERE mission_id = ?
    ORDER BY id ASC
  `,
		)
		.all(missionId) as Array<{
		id: string;
		name: string;
		description: string;
		status: string;
		fulfills: string;
		preconditions: string;
	}>;

	// Deserialize JSON fields
	const parsedFeatures = features.map((f) => ({
		id: f.id,
		name: f.name,
		description: f.description,
		status: f.status,
		fulfills: JSON.parse(f.fulfills) as string[],
		preconditions: JSON.parse(f.preconditions) as string[],
	}));

	const exportData: FeatureExport = {
		features: parsedFeatures,
		metadata: {
			missionId,
			totalCount: parsedFeatures.length,
			exportedAt: new Date().toISOString(),
		},
	};

	await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), "utf-8");
}

/**
 * Factory function to create Planner Agent
 *
 * @param db - Database connection
 * @param strategy - Feature generation strategy (default: one-to-one)
 * @param wayfinder - Optional Wayfinder client for Phase 2.2 enhancements
 * @returns Planner Agent instance
 */
export function createPlannerAgent(
	db: SqliteDb,
	strategy: FeatureGenerationStrategy = "one-to-one",
	wayfinder?: WayfinderClient,
): PlannerAgent {
	return new DefaultPlannerAgent(db, strategy, wayfinder);
}
