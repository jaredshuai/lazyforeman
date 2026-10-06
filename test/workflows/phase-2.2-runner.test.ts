/**
 * Phase 2.2 Mission Workflow Runner Test
 *
 * Executes the Mission Workflow for Phase 2.2 mission.md
 * to generate assertions.json and features.json.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { SqliteStepJournal } from "../../src/runtime/step-journal.js";
import type { WorkflowContext } from "../../src/runtime/workflow-runner.js";
import {
	executeMissionWorkflow,
	type MissionWorkflowConfig,
} from "../../src/workflows/mission.js";

describe("Phase 2.2 Mission Runner", () => {
	it("generates assertions.json and features.json for Phase 2.2", async () => {
		console.log("\n🚀 Starting Phase 2.2 Mission Workflow...\n");

		// Paths
		const projectRoot = process.cwd();
		const missionPath = join(
			projectRoot,
			"docs",
			"missions",
			"phase-2.2-mission.md",
		);
		const outputDir = join(
			projectRoot,
			".lazyforeman",
			"missions",
			"phase-2.2",
		);
		const dbPath = join(projectRoot, ".lazyforeman", "lazyforeman.db");

		console.log("📂 Paths:");
		console.log(`  Mission: ${missionPath}`);
		console.log(`  Output:  ${outputDir}`);
		console.log(`  DB:      ${dbPath}\n`);

		// Ensure output directory exists
		await mkdir(outputDir, { recursive: true });

		// Open database
		const db: SqliteDb = openDatabase(dbPath);
		const journal = new SqliteStepJournal(db);

		try {
			// Read mission.md
			console.log("📖 Reading mission.md...");
			const missionMarkdown = await readFile(missionPath, "utf-8");
			console.log(`  ✓ Loaded ${missionMarkdown.length} characters\n`);

			// Prepare workflow config
			const config: MissionWorkflowConfig = {
				missionId: "phase-2.2",
				missionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "phase-2.2-mission-workflow",
				journal,
			};

			// Execute workflow
			console.log("⚙️  Executing Mission Workflow...");
			console.log("  Steps:");
			console.log("    1. Parse mission.md");
			console.log("    2. Extract assertions (Investigator Agent)");
			console.log("    3. Generate features (Planner Agent)");
			console.log("    4. Validate coverage (Coverage Validator)");
			console.log("    5. Save to SQLite");
			console.log("    6. Export JSON artifacts\n");

			const result = await executeMissionWorkflow(ctx, db, config);

			// Report results
			console.log("✅ Mission Workflow completed successfully!\n");

			console.log("📊 Results:");
			console.log(`  Mission ID:       ${result.missionId}`);
			console.log(`  Assertions:       ${result.assertions.length}`);
			console.log(`  Features:         ${result.features.length}`);
			console.log(`  Coverage Passed:  ${result.coveragePassed ? "✓" : "✗"}`);
			console.log(
				`  Coverage:         ${result.coverageResult.coveragePercentage}%\n`,
			);

			console.log("📁 Output Files:");
			console.log(
				`  assertions.json:  ${result.artifactsExported.assertionsJson}`,
			);
			console.log(
				`  features.json:    ${result.artifactsExported.featuresJson}\n`,
			);

			console.log("🔍 Assertion Details:");
			for (const assertion of result.assertions.slice(0, 5)) {
				console.log(
					`  ${assertion.id}: ${assertion.description.substring(0, 60)}...`,
				);
			}
			if (result.assertions.length > 5) {
				console.log(`  ... and ${result.assertions.length - 5} more\n`);
			} else {
				console.log("");
			}

			console.log("🎯 Feature Details:");
			for (const feature of result.features.slice(0, 5)) {
				console.log(`  ${feature.id}: ${feature.name.substring(0, 60)}...`);
				console.log(`    Fulfills: ${feature.fulfills.join(", ")}`);
			}
			if (result.features.length > 5) {
				console.log(`  ... and ${result.features.length - 5} more\n`);
			} else {
				console.log("");
			}

			// Verify results
			expect(result.missionId).toBe("phase-2.2");
			expect(result.assertions.length).toBe(20); // VAL-2.2-001 to VAL-2.2-020
			expect(result.features.length).toBe(20); // One feature per assertion
			expect(result.coveragePassed).toBe(true);
			expect(result.coverageResult.coveragePercentage).toBe(100);

			// Verify assertion IDs
			expect(result.assertions[0].id).toBe("VAL-2.2-001");
			expect(result.assertions[19].id).toBe("VAL-2.2-020");

			// Verify feature IDs
			expect(result.features[0].id).toBe("feat-001");
			expect(result.features[19].id).toBe("feat-020");

			// Verify JSON artifacts exist and are valid
			const assertionsJson = await readFile(
				result.artifactsExported.assertionsJson,
				"utf-8",
			);
			const assertionsData = JSON.parse(assertionsJson);
			expect(assertionsData.assertions.length).toBe(20);
			expect(assertionsData.metadata.missionId).toBe("phase-2.2");

			const featuresJson = await readFile(
				result.artifactsExported.featuresJson,
				"utf-8",
			);
			const featuresData = JSON.parse(featuresJson);
			expect(featuresData.features.length).toBe(20);
			expect(featuresData.metadata.missionId).toBe("phase-2.2");

			console.log("✨ Phase 2.2 mission artifacts generated successfully!");
			console.log("\n📋 Summary:");
			console.log(`  ✓ Generated 20 assertions (VAL-2.2-001 to VAL-2.2-020)`);
			console.log(`  ✓ Generated 20 features (feat-001 to feat-020)`);
			console.log(`  ✓ Coverage validation passed (100%)`);
			console.log(`  ✓ Artifacts exported to: ${outputDir}`);
		} finally {
			db.close();
		}
	}, 60000); // 60 second timeout for LLM calls
});
