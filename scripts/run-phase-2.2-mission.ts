/**
 * Runner script for Phase 2.2 Mission Workflow
 *
 * Executes the Mission Workflow to generate assertions.json and features.json
 * for Phase 2.2 mission.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openDatabase } from "../src/db/connection.js";
import { SqliteStepJournal } from "../src/runtime/step-journal.js";
import type { WorkflowContext } from "../src/runtime/workflow-runner.js";
import {
	executeMissionWorkflow,
	type MissionWorkflowConfig,
	type MissionWorkflowResult,
} from "../src/workflows/mission.js";

async function runPhase22Mission() {
	console.log("🚀 Starting Phase 2.2 Mission Workflow...\n");

	// Paths
	const missionPath = join(
		process.cwd(),
		"docs",
		"missions",
		"phase-2.2-mission.md",
	);
	const outputDir = join(
		process.cwd(),
		".lazyforeman",
		"missions",
		"phase-2.2",
	);
	const dbPath = join(process.cwd(), ".lazyforeman", "lazyforeman.db");

	console.log("📂 Paths:");
	console.log(`  Mission: ${missionPath}`);
	console.log(`  Output:  ${outputDir}`);
	console.log(`  DB:      ${dbPath}\n`);

	// Open database
	const db = openDatabase(dbPath);
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

		const result: MissionWorkflowResult = await executeMissionWorkflow(
			ctx,
			db,
			config,
		);

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

		console.log("✨ Phase 2.2 mission artifacts generated successfully!");

		// Return summary for caller
		return {
			success: true,
			missionId: result.missionId,
			assertionsCount: result.assertions.length,
			featuresCount: result.features.length,
			coveragePassed: result.coveragePassed,
			assertionsJsonPath: result.artifactsExported.assertionsJson,
			featuresJsonPath: result.artifactsExported.featuresJson,
		};
	} catch (error) {
		console.error("\n❌ Mission Workflow failed:");
		console.error(error);
		throw error;
	} finally {
		db.close();
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runPhase22Mission()
		.then((result) => {
			console.log("\n✓ Script completed successfully");
			process.exit(0);
		})
		.catch((error) => {
			console.error("\n✗ Script failed");
			process.exit(1);
		});
}

export { runPhase22Mission };
