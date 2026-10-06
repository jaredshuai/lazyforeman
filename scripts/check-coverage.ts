/**
 * Check test coverage for Phase 2.2
 *
 * Validates that all new modules have >= 80% unit test coverage.
 * Uses vitest coverage reporting.
 *
 * Usage: pnpm run coverage
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const execAsync = promisify(exec);

interface CoverageModule {
	statements: number;
	branches: number;
	functions: number;
	lines: number;
}

interface CoverageSummary {
	[modulePath: string]: CoverageModule;
}

/**
 * Modules that must meet the 80% coverage requirement
 */
const REQUIRED_MODULES = [
	"src/grill/",
	"src/discovered-issues/",
	"src/orchestrator/",
	"src/signals/",
	"src/adjudication/",
];

/**
 * Parse vitest coverage report
 *
 * Note: vitest doesn't generate coverage-summary.json by default.
 * We'll run vitest with --coverage flag and parse the output.
 */
async function getCoverageData(): Promise<CoverageSummary> {
	// Check if coverage-summary.json exists
	const coveragePath = path.join(
		process.cwd(),
		"coverage/coverage-summary.json",
	);

	if (!existsSync(coveragePath)) {
		throw new Error(
			"Coverage report not found. Run tests with --coverage flag first.",
		);
	}

	const content = await readFile(coveragePath, "utf-8");
	const data = JSON.parse(content);

	return data;
}

/**
 * Calculate average coverage for a module directory
 */
function getModuleCoverage(
	summary: CoverageSummary,
	modulePrefix: string,
): number | null {
	const moduleFiles = Object.keys(summary).filter((path) =>
		path.includes(modulePrefix),
	);

	if (moduleFiles.length === 0) {
		return null;
	}

	let totalStatements = 0;
	let coveredStatements = 0;

	for (const file of moduleFiles) {
		const fileCov = summary[file];
		if (fileCov?.statements) {
			totalStatements += fileCov.statements.total || 0;
			coveredStatements += fileCov.statements.covered || 0;
		}
	}

	if (totalStatements === 0) {
		return 0;
	}

	return (coveredStatements / totalStatements) * 100;
}

/**
 * Check coverage for all required modules
 */
async function checkCoverage() {
	console.log("📊 Checking test coverage for Phase 2.2 modules...\n");

	try {
		// Run tests with coverage
		console.log("Running tests with coverage...");
		await execAsync("pnpm run test -- --coverage --reporter=verbose", {
			env: { ...process.env, NODE_ENV: "test" },
		});

		// Parse coverage report
		const coverageData = await getCoverageData();

		const failures: string[] = [];
		const results: Array<{ module: string; coverage: number | null }> = [];

		// Check each required module
		for (const module of REQUIRED_MODULES) {
			const coverage = getModuleCoverage(coverageData, module);

			results.push({ module, coverage });

			if (coverage === null) {
				console.log(`⚠️  ${module}: Module not found in coverage report`);
				continue;
			}

			if (coverage < 80) {
				failures.push(`${module}: ${coverage.toFixed(1)}% (< 80%)`);
			}
		}

		// Print results
		console.log("\n📊 Coverage Results:\n");
		for (const { module, coverage } of results) {
			if (coverage === null) {
				console.log(`  ${module}: [Module not found]`);
			} else {
				const status = coverage >= 80 ? "✅" : "❌";
				console.log(`  ${status} ${module}: ${coverage.toFixed(1)}%`);
			}
		}

		// Report failures
		if (failures.length > 0) {
			console.log("\n❌ Coverage check failed:\n");
			for (const failure of failures) {
				console.log(`  ${failure}`);
			}
			console.log("\nPlease add more tests to meet the 80% threshold.");
			process.exit(1);
		}

		console.log("\n✅ All modules have 80%+ coverage");
	} catch (error) {
		if (error instanceof Error) {
			console.error(`\n❌ Coverage check failed: ${error.message}`);
		} else {
			console.error("\n❌ Coverage check failed with unknown error");
		}
		process.exit(1);
	}
}

// Run coverage check
checkCoverage();
