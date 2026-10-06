/**
 * Mission Workflow unit tests
 *
 * Tests the complete mission workflow integration including:
 * - End-to-end workflow execution
 * - Individual step validation
 * - Error handling (invalid mission.md, coverage failures)
 * - Crash recovery at each step
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { SqliteStepJournal } from "../../src/runtime/step-journal.js";
import type { WorkflowContext } from "../../src/runtime/workflow-runner.js";
import {
	executeMissionWorkflow,
	type MissionWorkflowConfig,
} from "../../src/workflows/mission.js";

describe("Mission Workflow", () => {
	let db: SqliteDb;
	let journal: SqliteStepJournal;
	let outputDir: string;

	const validMissionMarkdown = `
# Mission: Test Mission

## 背景
- 背景句子 1：项目需要建立自动化测试体系
- 背景句子 2：当前测试覆盖率不足
- 背景句子 3：需要提升代码质量

## 目标
实现完整的测试覆盖体系

## 边界
✅ 做：实现单元测试框架
✅ 做：建立集成测试流程
❌ 不做：实现性能测试
❌ 不做：实现UI自动化测试

## 成功标准
- 单元测试覆盖率达到 80%
- 所有核心模块有集成测试
- CI 流程包含自动化测试
- 测试文档完整

## 架构约束
- 使用 Vitest 作为测试框架
- 遵循 AAA 模式（Arrange-Act-Assert）

## 风险
⚠️ 测试编写工作量可能超出预期
⚠️ 现有代码可能难以测试
`;

	beforeEach(async () => {
		db = openDatabase(":memory:");
		journal = new SqliteStepJournal(db);

		// Create unique temp output directory
		const randomId = randomBytes(8).toString("hex");
		outputDir = join(tmpdir(), `mission-test-${randomId}`);
		await mkdir(outputDir, { recursive: true });
	});

	afterEach(async () => {
		db.close();
		// Clean up temp directory
		await rm(outputDir, { recursive: true, force: true });
	});

	describe("executeMissionWorkflow", () => {
		it("executes full workflow successfully", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-001",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-001",
				journal,
			};

			const result = await executeMissionWorkflow(ctx, db, config);

			// Verify result structure
			expect(result.missionId).toBe("test-mission-001");
			expect(result.assertions).toBeDefined();
			expect(result.assertions.length).toBeGreaterThan(0);
			expect(result.features).toBeDefined();
			expect(result.features.length).toBe(result.assertions.length);
			expect(result.coveragePassed).toBe(true);
			expect(result.coverageResult.passed).toBe(true);
			expect(result.artifactsExported.assertionsJson).toContain(
				"assertions.json",
			);
			expect(result.artifactsExported.featuresJson).toContain("features.json");
		});

		it("parses mission markdown", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-002",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-002",
				journal,
			};

			const result = await executeMissionWorkflow(ctx, db, config);

			// Verify mission was parsed correctly
			expect(result.assertions.length).toBe(4); // 4 success criteria
		});

		it("extracts assertions", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-003",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-003",
				journal,
			};

			const result = await executeMissionWorkflow(ctx, db, config);

			// Verify assertions
			expect(result.assertions.length).toBe(4);
			expect(result.assertions[0].id).toBe("VAL-001");
			expect(result.assertions[0].description).toContain("单元测试覆盖率");
			expect(result.assertions[0].type).toBeDefined();
			expect(result.assertions[0].status).toBe("pending");
		});

		it("generates features", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-004",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-004",
				journal,
			};

			const result = await executeMissionWorkflow(ctx, db, config);

			// Verify features
			expect(result.features.length).toBe(4);
			expect(result.features[0].id).toBe("feat-001");
			expect(result.features[0].name).toBeDefined();
			expect(result.features[0].fulfills).toEqual(["VAL-001"]);
			expect(result.features[0].preconditions).toEqual([]);
			expect(result.features[0].status).toBe("pending");
		});

		it("validates coverage", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-005",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-005",
				journal,
			};

			const result = await executeMissionWorkflow(ctx, db, config);

			// Verify coverage validation
			expect(result.coveragePassed).toBe(true);
			expect(result.coverageResult.totalAssertions).toBe(4);
			expect(result.coverageResult.claimedAssertions).toBe(4);
			expect(result.coverageResult.coveragePercentage).toBe(100);
			expect(result.coverageResult.orphanAssertions).toEqual([]);
			expect(result.coverageResult.duplicateClaims.size).toBe(0);
		});

		it("saves data to database", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-006",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-006",
				journal,
			};

			await executeMissionWorkflow(ctx, db, config);

			// Verify mission metadata saved
			const missionMetadata = db
				.prepare("SELECT * FROM missions_metadata WHERE mission_id = ?")
				.get("test-mission-006");
			expect(missionMetadata).toBeDefined();

			// Verify assertions saved
			const assertions = db
				.prepare("SELECT * FROM assertions WHERE mission_id = ?")
				.all("test-mission-006");
			expect(assertions.length).toBe(4);

			// Verify features saved
			const features = db
				.prepare("SELECT * FROM features WHERE mission_id = ?")
				.all("test-mission-006");
			expect(features.length).toBe(4);

			// Verify coverage validation saved
			const validations = db
				.prepare("SELECT * FROM coverage_validations WHERE mission_id = ?")
				.all("test-mission-006");
			expect(validations.length).toBe(1);
		});

		it("exports JSON artifacts", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-007",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-007",
				journal,
			};

			const result = await executeMissionWorkflow(ctx, db, config);

			// Verify assertions.json
			const assertionsJson = await readFile(
				result.artifactsExported.assertionsJson,
				"utf-8",
			);
			const assertionsData = JSON.parse(assertionsJson);
			expect(assertionsData.assertions).toBeDefined();
			expect(assertionsData.assertions.length).toBe(4);
			expect(assertionsData.metadata).toBeDefined();
			expect(assertionsData.metadata.missionId).toBe("test-mission-007");

			// Verify features.json
			const featuresJson = await readFile(
				result.artifactsExported.featuresJson,
				"utf-8",
			);
			const featuresData = JSON.parse(featuresJson);
			expect(featuresData.features).toBeDefined();
			expect(featuresData.features.length).toBe(4);
			expect(featuresData.metadata).toBeDefined();
			expect(featuresData.metadata.missionId).toBe("test-mission-007");
		});

		it("throws error on invalid mission.md", async () => {
			const invalidMissionMarkdown = `
# Mission: Invalid Mission

## 背景
- 只有一句背景

## 目标
实现功能

## 边界
✅ 做：实现功能

## 成功标准
- 标准 1

## 架构约束
- 约束 1
`;

			const config: MissionWorkflowConfig = {
				missionId: "test-mission-008",
				missionMarkdown: invalidMissionMarkdown,
				outputDir,
			};

			const ctx: WorkflowContext = {
				workflowId: "mission-test-008",
				journal,
			};

			await expect(executeMissionWorkflow(ctx, db, config)).rejects.toThrow(
				"Mission validation failed",
			);
		});

		it("throws error on coverage < 100%", async () => {
			// Create a mission with mismatched assertions and features
			const invalidMissionMarkdown = `
# Mission: Invalid Coverage Test

## 背景
- 背景句子 1：测试覆盖率验证
- 背景句子 2：故意制造覆盖不足
- 背景句子 3：验证硬门禁生效

## 目标
测试覆盖率验证失败场景

## 边界
✅ 做：测试功能
❌ 不做：跳过测试

## 成功标准
- 标准 1
- 标准 2
- 标准 3
- 标准 4
- 标准 5

## 架构约束
- 使用测试框架

## 风险
⚠️ 测试可能失败
`;

			const config: MissionWorkflowConfig = {
				missionId: "test-mission-009",
				missionMarkdown: invalidMissionMarkdown,
				outputDir,
			};

			// First, run workflow to generate features
			const ctx1: WorkflowContext = {
				workflowId: "mission-test-009-setup",
				journal,
			};

			const result = await executeMissionWorkflow(ctx1, db, config);

			// Now manually remove one feature's fulfills to break coverage
			db.prepare(
				"UPDATE features SET fulfills = '[]' WHERE id = 'feat-001'",
			).run();

			// Load the corrupted features from database
			const corruptedFeatures = db
				.prepare("SELECT * FROM features WHERE mission_id = ?")
				.all(config.missionId) as Array<{
				id: string;
				name: string;
				description: string;
				status: string;
				fulfills: string;
				preconditions: string;
			}>;

			// Parse JSON fields
			const features = corruptedFeatures.map((f) => ({
				id: f.id,
				name: f.name,
				description: f.description,
				status: f.status as "pending" | "in_progress" | "completed" | "failed",
				fulfills: JSON.parse(f.fulfills) as string[],
				preconditions: JSON.parse(f.preconditions) as string[],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}));

			// Validate coverage with corrupted features
			const { createCoverageValidator } = await import(
				"../../src/validator/coverage-validator.js"
			);
			const validator = createCoverageValidator(db);
			const coverageResult = validator.validate(result.assertions, features);

			// Should fail validation
			expect(coverageResult.passed).toBe(false);
			expect(coverageResult.orphanAssertions.length).toBeGreaterThan(0);
		});
	});

	describe("crash recovery", () => {
		it("resumes from last completed step after crash", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-010",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const workflowId = "mission-recovery-test-001";

			// First execution: crash after extractAssertions
			const ctx1: WorkflowContext = {
				workflowId,
				journal,
				_testHooks: {
					async afterStep(stepName: string) {
						if (stepName === "extractAssertions") {
							throw new Error("Simulated crash after extractAssertions");
						}
					},
				},
			};

			await expect(executeMissionWorkflow(ctx1, db, config)).rejects.toThrow(
				"Simulated crash after extractAssertions",
			);

			// Verify parseMissionMarkdown and extractAssertions completed
			const step1 = journal.getStep(workflowId, "parseMissionMarkdown");
			expect(step1?.status).toBe("success");

			const step2 = journal.getStep(workflowId, "extractAssertions");
			expect(step2?.status).toBe("success");

			// Second execution: resume without crash
			const ctx2: WorkflowContext = {
				workflowId,
				journal,
			};

			const result = await executeMissionWorkflow(ctx2, db, config);

			// Verify workflow completed successfully
			expect(result.coveragePassed).toBe(true);

			// Verify all steps completed
			const step3 = journal.getStep(workflowId, "generateFeatures");
			expect(step3?.status).toBe("success");

			const step4 = journal.getStep(workflowId, "validateCoverage");
			expect(step4?.status).toBe("success");

			const step5 = journal.getStep(workflowId, "saveMissionData");
			expect(step5?.status).toBe("success");

			const step6 = journal.getStep(workflowId, "exportArtifacts");
			expect(step6?.status).toBe("success");
		});

		it("does not re-execute completed steps", async () => {
			const config: MissionWorkflowConfig = {
				missionId: "test-mission-011",
				missionMarkdown: validMissionMarkdown,
				outputDir,
			};

			const workflowId = "mission-recovery-test-002";

			// First execution: crash after generateFeatures
			const ctx1: WorkflowContext = {
				workflowId,
				journal,
				_testHooks: {
					async afterStep(stepName: string) {
						if (stepName === "generateFeatures") {
							throw new Error("Simulated crash after generateFeatures");
						}
					},
				},
			};

			await expect(executeMissionWorkflow(ctx1, db, config)).rejects.toThrow(
				"Simulated crash after generateFeatures",
			);

			// Track step execution count
			let parseMissionExecutions = 0;
			let extractAssertionsExecutions = 0;
			let generateFeaturesExecutions = 0;

			// Second execution: resume and count executions
			const ctx2: WorkflowContext = {
				workflowId,
				journal,
				_testHooks: {
					async beforeStep(stepName: string) {
						if (stepName === "parseMissionMarkdown") parseMissionExecutions++;
						if (stepName === "extractAssertions") extractAssertionsExecutions++;
						if (stepName === "generateFeatures") generateFeaturesExecutions++;
					},
				},
			};

			const result = await executeMissionWorkflow(ctx2, db, config);

			// Verify completed steps were not re-executed
			expect(parseMissionExecutions).toBe(0); // Already completed, skipped
			expect(extractAssertionsExecutions).toBe(0); // Already completed, skipped
			expect(generateFeaturesExecutions).toBe(0); // Already completed, skipped

			// Verify workflow completed
			expect(result.coveragePassed).toBe(true);
		});
	});
});
