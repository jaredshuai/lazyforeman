/**
 * Mission Workflow - Phase 2.1 End-to-End Integration
 *
 * Orchestrates the complete mission processing pipeline:
 * 1. Parse mission.md
 * 2. Extract assertions (Investigator Agent)
 * 3. Generate features (Planner Agent)
 * 4. Validate coverage (Coverage Validator) - Hard gate
 * 5. Save all data to SQLite
 * 6. Export JSON artifacts
 *
 * Uses runStep() pattern for crash recovery (ADR-0001).
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { SqliteDb } from "../db/connection.js";
import type { WorkflowContext } from "../runtime/workflow-runner.js";
import { runStep } from "../runtime/workflow-runner.js";
import { createMissionParser } from "../mission/parser.js";
import { createInvestigatorAgent } from "../investigator/agent.js";
import { createPlannerAgent } from "../planner/agent.js";
import { createCoverageValidator } from "../validator/coverage-validator.js";
import type { Assertion } from "../types/assertion.js";
import type { Feature } from "../types/feature.js";
import type { CoverageValidationResult } from "../validator/coverage-validator.js";

/**
 * Mission Workflow configuration
 */
export interface MissionWorkflowConfig {
	/** Mission identifier */
	missionId: string;

	/** Mission markdown content */
	missionMarkdown: string;

	/** Output directory for JSON artifacts */
	outputDir: string;
}

/**
 * Mission Workflow result
 */
export interface MissionWorkflowResult {
	/** Mission identifier */
	missionId: string;

	/** Extracted assertions */
	assertions: Assertion[];

	/** Generated features */
	features: Feature[];

	/** Coverage validation passed */
	coveragePassed: boolean;

	/** Coverage validation result */
	coverageResult: CoverageValidationResult;

	/** Exported artifact paths */
	artifactsExported: {
		assertionsJson: string;
		featuresJson: string;
	};
}

/**
 * Execute Mission Workflow
 *
 * Phase 2.1 complete pipeline:
 * 1. parseMissionMarkdown - Parse and validate mission.md
 * 2. extractAssertions - Extract validation assertions
 * 3. generateFeatures - Generate features from assertions
 * 4. validateCoverage - Verify 100% assertion coverage (hard gate)
 * 5. saveMissionData - Persist all data to SQLite
 * 6. exportArtifacts - Export assertions.json and features.json
 *
 * Uses runStep() to ensure crash recovery at each stage.
 *
 * @param ctx - Workflow context with journal for crash recovery
 * @param db - SQLite database connection
 * @param config - Mission workflow configuration
 * @returns Mission workflow result with all generated data
 * @throws Error if mission validation fails or coverage < 100%
 */
export async function executeMissionWorkflow(
	ctx: WorkflowContext,
	db: SqliteDb,
	config: MissionWorkflowConfig,
): Promise<MissionWorkflowResult> {
	const { missionId, missionMarkdown, outputDir } = config;

	// Step 1: Parse mission markdown and validate quality gates
	const missionDocument = await runStep(
		ctx,
		"parseMissionMarkdown",
		async () => {
			const parser = createMissionParser();
			const doc = parser.parse(missionMarkdown);
			const validation = parser.validate(doc);

			if (!validation.valid) {
				const errors = validation.violations
					.map((v) => `${v.field}: ${v.message}`)
					.join("\n");
				throw new Error(`Mission validation failed:\n${errors}`);
			}

			return doc;
		},
	);

	// Step 2: Extract assertions using Investigator Agent
	const assertionResult = await runStep(ctx, "extractAssertions", async () => {
		const investigator = createInvestigatorAgent(db);
		return await investigator.extractAssertions(missionDocument);
	});
	const assertions = assertionResult.assertions;

	// Step 3: Generate features using Planner Agent
	const features = await runStep(ctx, "generateFeatures", async () => {
		const planner = createPlannerAgent(db, "one-to-one");
		return await planner.generateFeatures(
			missionId,
			missionDocument,
			assertions,
		);
	});

	// Step 4: Validate coverage (hard gate - must be 100%)
	const coverageResult = await runStep(ctx, "validateCoverage", async () => {
		const validator = createCoverageValidator(db);
		const result = validator.validate(assertions, features);

		// Hard gate: coverage must be 100%
		if (!result.passed) {
			const report = validator.generateReport(result);
			throw new Error(`Coverage validation failed:\n\n${report}`);
		}

		return result;
	});

	// Step 5: Save all data to SQLite
	await runStep(ctx, "saveMissionData", async () => {
		const investigator = createInvestigatorAgent(db);
		const planner = createPlannerAgent(db);
		const validator = createCoverageValidator(db);

		// Save mission record first (required for foreign key constraints)
		const timestamp = new Date().toISOString();
		db.prepare(
			`INSERT INTO missions (id, name, description, status, created_at, updated_at)
			 VALUES (?, ?, ?, 'in_progress', ?, ?)
			 ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at`,
		).run(
			missionId,
			missionDocument.name,
			missionDocument.goal,
			timestamp,
			timestamp,
		);

		// Save mission metadata
		await investigator.saveMissionMetadata(missionId, missionDocument);

		// Save assertions
		await investigator.saveAssertions(missionId, assertions);

		// Save features
		await planner.saveFeatures(missionId, features);

		// Save coverage validation result
		await validator.saveValidationResult(missionId, coverageResult);

		return { saved: true };
	});

	// Step 6: Export JSON artifacts
	const artifacts = await runStep(ctx, "exportArtifacts", async () => {
		// Ensure output directory exists
		await fs.mkdir(outputDir, { recursive: true });

		// Export assertions.json
		const assertionsPath = path.join(outputDir, "assertions.json");
		await fs.writeFile(
			assertionsPath,
			JSON.stringify(
				{
					assertions: assertions.map((a) => ({
						id: a.id,
						description: a.description,
						status: a.status,
						type: a.type,
						sourceIndex: a.sourceIndex,
						createdFrom: a.createdFrom,
					})),
					metadata: {
						missionId,
						totalCount: assertions.length,
						...assertionResult.metadata,
					},
				},
				null,
				2,
			),
			"utf-8",
		);

		// Export features.json
		const featuresPath = path.join(outputDir, "features.json");
		await fs.writeFile(
			featuresPath,
			JSON.stringify(
				{
					features: features.map((f) => ({
						id: f.id,
						name: f.name,
						description: f.description,
						status: f.status,
						fulfills: f.fulfills,
						preconditions: f.preconditions,
					})),
					metadata: {
						missionId,
						totalCount: features.length,
						exportedAt: new Date().toISOString(),
					},
				},
				null,
				2,
			),
			"utf-8",
		);

		return {
			assertionsJson: assertionsPath,
			featuresJson: featuresPath,
		};
	});

	return {
		missionId,
		assertions,
		features,
		coveragePassed: coverageResult.passed,
		coverageResult,
		artifactsExported: artifacts,
	};
}
