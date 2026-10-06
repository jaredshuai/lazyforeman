/**
 * Quality Gates Runner
 *
 * Runs all quality checks required for Phase 2.2:
 * - TypeScript strict type checking
 * - Biome format checking
 * - Biome linting
 *
 * Usage: pnpm run quality
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface QualityCheck {
	name: string;
	command: string;
	description: string;
}

const QUALITY_CHECKS: QualityCheck[] = [
	{
		name: "TypeScript strict check",
		command: "pnpm run type",
		description: "Verify all TypeScript types with strict mode",
	},
	{
		name: "Biome format check",
		command: "pnpm run format:check",
		description: "Verify code formatting consistency",
	},
	{
		name: "Biome lint",
		command: "pnpm run lint",
		description: "Verify code quality and best practices",
	},
];

/**
 * Run a single quality check
 */
async function runCheck(check: QualityCheck): Promise<boolean> {
	console.log(`\n🔍 Running ${check.name}...`);
	console.log(`   ${check.description}`);

	try {
		const { stdout, stderr } = await execAsync(check.command);

		if (stdout) {
			console.log(stdout);
		}

		console.log(`✅ ${check.name} passed`);
		return true;
	} catch (error) {
		console.error(`❌ ${check.name} failed`);

		if (error && typeof error === "object" && "stdout" in error) {
			const execError = error as { stdout: string; stderr: string };
			if (execError.stdout) {
				console.error(execError.stdout);
			}
			if (execError.stderr) {
				console.error(execError.stderr);
			}
		}

		return false;
	}
}

/**
 * Run all quality checks
 */
async function runQualityChecks() {
	console.log("🎯 Running Quality Gates for Phase 2.2\n");
	console.log("=".repeat(50));

	const results: Array<{ check: QualityCheck; passed: boolean }> = [];

	// Run all checks
	for (const check of QUALITY_CHECKS) {
		const passed = await runCheck(check);
		results.push({ check, passed });
	}

	// Summary
	console.log("\n" + "=".repeat(50));
	console.log("\n📊 Quality Check Summary:\n");

	const failures: QualityCheck[] = [];

	for (const { check, passed } of results) {
		const status = passed ? "✅" : "❌";
		console.log(`  ${status} ${check.name}`);

		if (!passed) {
			failures.push(check);
		}
	}

	// Report result
	if (failures.length > 0) {
		console.log("\n❌ Quality checks failed. Please fix the issues above.");
		console.log("\nFailed checks:");
		for (const check of failures) {
			console.log(`  - ${check.name}: ${check.command}`);
		}
		process.exit(1);
	}

	console.log("\n✅ All quality checks passed!");
	console.log("\nYou're ready to commit your changes.");
}

// Run quality checks
runQualityChecks();
