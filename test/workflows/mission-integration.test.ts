/**
 * Mission Workflow integration tests
 *
 * Tests end-to-end workflow execution with realistic mission.md scenarios,
 * large-scale missions, and crash recovery at various points.
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

describe("Mission Workflow Integration", () => {
	let db: SqliteDb;
	let journal: SqliteStepJournal;
	let outputDir: string;

	beforeEach(async () => {
		db = openDatabase(":memory:");
		journal = new SqliteStepJournal(db);

		const randomId = randomBytes(8).toString("hex");
		outputDir = join(tmpdir(), `mission-integration-test-${randomId}`);
		await mkdir(outputDir, { recursive: true });
	});

	afterEach(async () => {
		db.close();
		await rm(outputDir, { recursive: true, force: true });
	});

	it("executes end-to-end workflow with real mission.md", async () => {
		const realMissionMarkdown = `
# Mission: Implement Feature Flag System

## 背景
- 当前系统缺乏功能开关能力，新功能上线风险较高
- 需要支持灰度发布和A/B测试
- 团队希望能够快速回滚有问题的功能而不需要重新部署
- 现有配置系统无法满足动态开关的需求

## 目标
实现一个完整的功能开关（Feature Flag）系统，支持动态配置、灰度发布和A/B测试

## 边界
✅ 做：实现基于配置的功能开关核心引擎
✅ 做：提供 SDK 供应用代码调用
✅ 做：实现灰度发布策略（百分比、白名单）
✅ 做：建立配置存储和缓存机制
✅ 做：提供管理界面查看和修改开关状态
❌ 不做：实现复杂的多变量实验平台
❌ 不做：集成第三方商业功能开关服务
❌ 不做：实现实时数据分析和报表

## 成功标准
- 核心引擎支持至少5种开关策略（全开、全关、百分比、白名单、黑名单）
- SDK 接入简单，单个开关判断响应时间 < 1ms
- 配置变更后5秒内生效
- 提供 RESTful API 管理开关
- 管理界面可以可视化查看所有开关状态
- 集成测试覆盖所有核心场景
- 文档包含接入指南和最佳实践

## 架构约束
- 使用 TypeScript 实现，保持类型安全
- 核心引擎零依赖，SDK 层可依赖必要库
- 配置存储支持 SQLite 和 Redis 两种后端
- 使用装饰器模式集成到现有代码
- 遵循单一职责原则，开关判断逻辑与业务代码解耦

## 风险
⚠️ 配置缓存可能导致不同实例状态不一致
⚠️ 大量开关可能影响系统性能
⚠️ 配置错误可能导致功能异常
`;

		const config: MissionWorkflowConfig = {
			missionId: "feature-flag-mission",
			missionMarkdown: realMissionMarkdown,
			outputDir,
		};

		const ctx: WorkflowContext = {
			workflowId: "integration-test-001",
			journal,
		};

		const result = await executeMissionWorkflow(ctx, db, config);

		// Verify workflow completed successfully
		expect(result.missionId).toBe("feature-flag-mission");
		expect(result.coveragePassed).toBe(true);

		// Verify assertions extracted from 7 success criteria
		expect(result.assertions.length).toBe(7);
		expect(result.assertions[0].id).toBe("VAL-001");
		expect(result.assertions[0].description).toContain("核心引擎支持");

		// Verify features generated (one-to-one mapping)
		expect(result.features.length).toBe(7);
		expect(result.features[0].id).toBe("feat-001");
		expect(result.features[0].fulfills).toEqual(["VAL-001"]);

		// Verify 100% coverage
		expect(result.coverageResult.coveragePercentage).toBe(100);
		expect(result.coverageResult.orphanAssertions).toEqual([]);
		expect(result.coverageResult.duplicateClaims.size).toBe(0);

		// Verify artifacts exported
		const assertionsJson = await readFile(
			result.artifactsExported.assertionsJson,
			"utf-8",
		);
		const assertionsData = JSON.parse(assertionsJson);
		expect(assertionsData.assertions.length).toBe(7);
		expect(assertionsData.metadata.missionId).toBe("feature-flag-mission");

		const featuresJson = await readFile(
			result.artifactsExported.featuresJson,
			"utf-8",
		);
		const featuresData = JSON.parse(featuresJson);
		expect(featuresData.features.length).toBe(7);
		expect(featuresData.metadata.missionId).toBe("feature-flag-mission");

		// Verify database persistence
		const missionMetadata = db
			.prepare("SELECT * FROM missions_metadata WHERE mission_id = ?")
			.get("feature-flag-mission");
		expect(missionMetadata).toBeDefined();

		const assertions = db
			.prepare("SELECT * FROM assertions WHERE mission_id = ?")
			.all("feature-flag-mission");
		expect(assertions.length).toBe(7);

		const features = db
			.prepare("SELECT * FROM features WHERE mission_id = ?")
			.all("feature-flag-mission");
		expect(features.length).toBe(7);
	});

	it("handles large missions with 30+ assertions", async () => {
		// Generate a large mission with 30 success criteria
		const successCriteria = Array.from(
			{ length: 30 },
			(_, i) => `- 成功标准 ${i + 1}：实现功能点 ${i + 1}`,
		).join("\n");

		const largeMissionMarkdown = `
# Mission: Large Scale System Migration

## 背景
- 现有系统架构老旧，需要全面升级
- 业务增长迅速，现有系统已无法满足需求
- 技术栈落后，招聘和维护困难
- 系统稳定性和性能问题频发

## 目标
完成系统架构升级和技术栈迁移

## 边界
✅ 做：升级核心系统架构
✅ 做：迁移数据库到新技术栈
❌ 不做：重写所有历史代码
❌ 不做：改变现有业务流程

## 成功标准
${successCriteria}

## 架构约束
- 保持系统向后兼容
- 采用微服务架构
- 使用容器化部署

## 风险
⚠️ 迁移过程可能影响线上服务
⚠️ 数据迁移可能出现丢失或错误
`;

		const config: MissionWorkflowConfig = {
			missionId: "large-mission",
			missionMarkdown: largeMissionMarkdown,
			outputDir,
		};

		const ctx: WorkflowContext = {
			workflowId: "integration-test-002",
			journal,
		};

		const result = await executeMissionWorkflow(ctx, db, config);

		// Verify large mission processed successfully
		expect(result.assertions.length).toBe(30);
		expect(result.features.length).toBe(30);
		expect(result.coveragePassed).toBe(true);
		expect(result.coverageResult.coveragePercentage).toBe(100);

		// Verify all assertions have unique IDs
		const assertionIds = new Set(result.assertions.map((a) => a.id));
		expect(assertionIds.size).toBe(30);

		// Verify all features have unique IDs
		const featureIds = new Set(result.features.map((f) => f.id));
		expect(featureIds.size).toBe(30);

		// Verify ID formats
		expect(result.assertions[0].id).toBe("VAL-001");
		expect(result.assertions[29].id).toBe("VAL-030");
		expect(result.features[0].id).toBe("feat-001");
		expect(result.features[29].id).toBe("feat-030");

		// Verify each feature fulfills exactly one assertion
		for (let i = 0; i < 30; i++) {
			expect(result.features[i].fulfills).toEqual([result.assertions[i].id]);
		}
	});

	it("recovers from crash at each step", async () => {
		const missionMarkdown = `
# Mission: Crash Recovery Test

## 背景
- 测试崩溃恢复能力
- 验证每个步骤的幂等性
- 确保数据一致性

## 目标
完成崩溃恢复验证

## 边界
✅ 做：测试所有步骤
❌ 不做：跳过步骤

## 成功标准
- 步骤1验证通过
- 步骤2验证通过
- 步骤3验证通过

## 架构约束
- 使用事务保证原子性

## 风险
⚠️ 崩溃可能导致数据不一致
`;

		const config: MissionWorkflowConfig = {
			missionId: "crash-recovery-mission",
			missionMarkdown: missionMarkdown,
			outputDir,
		};

		// Test crash recovery at each step
		const steps = [
			"parseMissionMarkdown",
			"extractAssertions",
			"generateFeatures",
			"validateCoverage",
			"saveMissionData",
			"exportArtifacts",
		];

		for (const crashStep of steps) {
			// Reset database for each test
			if (db) db.close();
			db = openDatabase(":memory:");
			journal = new SqliteStepJournal(db);

			const workflowId = `crash-recovery-${crashStep}`;

			// First execution: crash after target step
			const ctx1: WorkflowContext = {
				workflowId,
				journal,
				_testHooks: {
					async afterStep(stepName: string) {
						if (stepName === crashStep) {
							throw new Error(`Simulated crash after ${crashStep}`);
						}
					},
				},
			};

			await expect(executeMissionWorkflow(ctx1, db, config)).rejects.toThrow(
				`Simulated crash after ${crashStep}`,
			);

			// Verify target step completed successfully
			const step = journal.getStep(workflowId, crashStep);
			expect(step?.status).toBe("success");

			// Second execution: resume without crash
			const ctx2: WorkflowContext = {
				workflowId,
				journal,
			};

			const result = await executeMissionWorkflow(ctx2, db, config);

			// Verify workflow completed successfully after recovery
			expect(result.coveragePassed).toBe(true);
			expect(result.assertions.length).toBe(3);
			expect(result.features.length).toBe(3);

			// Verify all steps completed
			for (const stepName of steps) {
				const completedStep = journal.getStep(workflowId, stepName);
				expect(completedStep?.status).toBe("success");
			}

			// Clean up
			db.close();
		}
	});
});
