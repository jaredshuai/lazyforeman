/**
 * PlanAdjuster unit tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultPlanAdjuster } from "../../src/orchestrator/plan-adjuster.js";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";
import type { SignalManager } from "../../src/signals/manager.js";
import {
	mockOriginalFeature,
	mockFeatureWithPreconditions,
} from "./fixtures/mock-features.js";
import { mockBlockingDependencyIssue } from "./fixtures/mock-issues.js";
import type { DiscoveredIssue } from "../../src/types/handoff.js";

// Mock SignalManager
const mockSignalManager: SignalManager = {
	send: async () => "signal-001",
	resolve: async () => {},
	list: async () => [],
	get: async () => null,
} as unknown as SignalManager;

describe("DefaultPlanAdjuster", () => {
	let db: SqliteDb;
	let adjuster: DefaultPlanAdjuster;

	beforeEach(() => {
		// Use in-memory database for tests
		db = openDatabase(":memory:");
		adjuster = new DefaultPlanAdjuster(mockSignalManager, db);

		// Insert a test mission
		db.prepare(
			`INSERT INTO missions (id, name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
		).run(
			"mission-001",
			"Test Mission",
			"in_progress",
			new Date().toISOString(),
			new Date().toISOString(),
		);
	});

	describe("handleDependencyMissing", () => {
		it("应该生成新 feature 并更新原 feature 的 preconditions", async () => {
			// Insert original feature
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			const result = await adjuster.handleDependencyMissing(
				mockBlockingDependencyIssue,
				mockOriginalFeature,
			);

			// Verify result
			expect(result.action).toBe("feature_created");
			expect(result.newFeature).toBeDefined();
			expect(result.newFeature?.id).toBe("feat-002");
			expect(result.newFeature?.name).toContain("缺少后端 API 接口");
			expect(result.newFeature?.status).toBe("pending");
			expect(result.newFeature?.fulfills).toEqual([]);
			expect(result.newFeature?.preconditions).toEqual([]);

			expect(result.updatedFeatures).toBeDefined();
			expect(result.updatedFeatures?.length).toBe(1);
			expect(result.updatedFeatures?.[0].preconditions).toContain("feat-002");

			// Verify database
			const newFeature = db
				.prepare(`SELECT * FROM features WHERE id = ?`)
				.get("feat-002");
			expect(newFeature).toBeDefined();

			const updatedOriginal = db
				.prepare(`SELECT preconditions FROM features WHERE id = ?`)
				.get(mockOriginalFeature.id) as { preconditions: string };
			const preconditions = JSON.parse(updatedOriginal.preconditions);
			expect(preconditions).toContain("feat-002");
		});

		it("应该正确生成 feature ID（递增）", async () => {
			// Insert original feature
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			// First dependency
			const result1 = await adjuster.handleDependencyMissing(
				mockBlockingDependencyIssue,
				mockOriginalFeature,
			);
			expect(result1.newFeature?.id).toBe("feat-002");

			// Second dependency
			const issue2: DiscoveredIssue = {
				...mockBlockingDependencyIssue,
				id: "ISSUE-008",
				description: "缺少数据库表",
				suggestedFix: "创建 users 表",
			};

			const result2 = await adjuster.handleDependencyMissing(
				issue2,
				mockOriginalFeature,
			);
			expect(result2.newFeature?.id).toBe("feat-003");
		});

		it("应该保留原 feature 已有的 preconditions", async () => {
			// Insert feat-001 first (required by preconditions)
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			// Insert feature with existing preconditions
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockFeatureWithPreconditions.id,
				"mission-001",
				mockFeatureWithPreconditions.name,
				mockFeatureWithPreconditions.description,
				mockFeatureWithPreconditions.status,
				JSON.stringify(mockFeatureWithPreconditions.fulfills),
				JSON.stringify(mockFeatureWithPreconditions.preconditions),
				mockFeatureWithPreconditions.createdAt,
				mockFeatureWithPreconditions.updatedAt,
			);

			const result = await adjuster.handleDependencyMissing(
				mockBlockingDependencyIssue,
				mockFeatureWithPreconditions,
			);

			expect(result.updatedFeatures?.[0].preconditions).toContain("feat-001");
			expect(result.updatedFeatures?.[0].preconditions).toContain("feat-003");
			expect(result.updatedFeatures?.[0].preconditions.length).toBe(2);
		});

		it("应该正确生成 feature description", async () => {
			// Insert original feature
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			const result = await adjuster.handleDependencyMissing(
				mockBlockingDependencyIssue,
				mockOriginalFeature,
			);

			expect(result.newFeature?.description).toContain(
				"实现依赖：缺少后端 API 接口",
			);
			expect(result.newFeature?.description).toContain(
				"上下文：实现登录功能时发现",
			);
			expect(result.newFeature?.description).toContain(
				"建议方案：先实现 POST /api/v1/login",
			);
		});

		it("应该处理没有 suggestedFix 的 issue", async () => {
			// Insert original feature
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			const issueWithoutFix: DiscoveredIssue = {
				...mockBlockingDependencyIssue,
				suggestedFix: undefined,
			};

			const result = await adjuster.handleDependencyMissing(
				issueWithoutFix,
				mockOriginalFeature,
			);

			expect(result.newFeature?.name).toContain("缺少后端 API 接口");
			expect(result.newFeature?.description).toContain(
				"实现依赖：缺少后端 API 接口",
			);
			expect(result.newFeature?.description).not.toContain("建议方案");
		});

		it("应该截断过长的 feature name", async () => {
			// Insert original feature
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			const longIssue: DiscoveredIssue = {
				...mockBlockingDependencyIssue,
				description:
					"这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的问题描述，超过了50个字符的限制，需要被截断处理",
			};

			const result = await adjuster.handleDependencyMissing(
				longIssue,
				mockOriginalFeature,
			);

			expect(result.newFeature?.name.length).toBeLessThanOrEqual(50);
			expect(result.newFeature?.name).toMatch(/\.\.\.$/);
		});

		it("应该处理多个依赖缺失 issue", async () => {
			// Insert original feature
			db.prepare(
				`INSERT INTO features (
          id, mission_id, name, description, status, 
          fulfills, preconditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				mockOriginalFeature.id,
				"mission-001",
				mockOriginalFeature.name,
				mockOriginalFeature.description,
				mockOriginalFeature.status,
				JSON.stringify(mockOriginalFeature.fulfills),
				JSON.stringify(mockOriginalFeature.preconditions),
				mockOriginalFeature.createdAt,
				mockOriginalFeature.updatedAt,
			);

			const issue1: DiscoveredIssue = {
				id: "ISSUE-009",
				severity: "blocking",
				category: "dependency_missing",
				description: "缺少后端 API 接口",
				context: "登录功能",
				suggestedFix: "实现 POST /api/v1/login",
				discoveredAt: new Date().toISOString(),
			};

			const issue2: DiscoveredIssue = {
				id: "ISSUE-010",
				severity: "blocking",
				category: "dependency_missing",
				description: "缺少数据库表",
				context: "用户存储",
				suggestedFix: "创建 users 表",
				discoveredAt: new Date().toISOString(),
			};

			const result1 = await adjuster.handleDependencyMissing(
				issue1,
				mockOriginalFeature,
			);
			const result2 = await adjuster.handleDependencyMissing(
				issue2,
				result1.updatedFeatures![0],
			);

			expect(result1.newFeature?.id).toBe("feat-002");
			expect(result2.newFeature?.id).toBe("feat-003");

			// Original feature should have both dependencies
			const updatedOriginal = db
				.prepare(`SELECT preconditions FROM features WHERE id = ?`)
				.get(mockOriginalFeature.id) as { preconditions: string };
			const preconditions = JSON.parse(updatedOriginal.preconditions);
			expect(preconditions).toContain("feat-002");
			expect(preconditions).toContain("feat-003");
		});
	});
});
