/**
 * Vision Integration Tests
 *
 * End-to-end tests for vision conflict detection integration with IssuesHandler
 * Tests the complete flow: Worker returns issue → vision detection → correct action
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DefaultVisionConflictDetector } from "../../src/orchestrator/vision-conflict-detector.js";
import { IssuesClassifier } from "../../src/orchestrator/issues-classifier.js";
import { DefaultIssuesHandler } from "../../src/orchestrator/issues-handler.js";
import {
	mockIssueViolatesBoundary,
	mockIssueViolatesConstraint,
	mockIssueNoConflict,
	mockBlockingDependencyIssue,
} from "./fixtures/mock-issues.js";
import { mockMissionDocument } from "./fixtures/mock-mission.js";
import type {
	VisionContext,
	PlanAdjuster,
} from "../../src/orchestrator/types.js";
import type { DiscoveredIssue } from "../../src/types/handoff.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import fs from "node:fs";

interface DiscoveredIssuesRepository {
	loadByHandoffId(handoffId: string): Promise<DiscoveredIssue[]>;
	save(issue: DiscoveredIssue, handoffId: string, featureId: string): void;
	saveAsync(issues: DiscoveredIssue[], handoffId: string): Promise<void>;
}

describe("Vision Integration Tests", () => {
	let db: SqliteDb;
	let tempDbPath: string;

	beforeEach(() => {
		// Create temporary database for testing
		tempDbPath = `.test-vision-${Date.now()}.db`;
		db = openDatabase(tempDbPath);

		// Initialize tables
		db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discovered_issues (
        id TEXT PRIMARY KEY,
        handoff_id TEXT NOT NULL,
        feature_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        context TEXT NOT NULL,
        suggested_fix TEXT,
        affected_assertions TEXT,
        discovered_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        fulfills TEXT NOT NULL,
        preconditions TEXT NOT NULL,
        current_worker_session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (mission_id) REFERENCES missions(id)
      );
    `);
	});

	afterEach(() => {
		db.close();
		if (fs.existsSync(tempDbPath)) {
			fs.unlinkSync(tempDbPath);
		}
	});

	const createMockRepository = (
		issues: DiscoveredIssue[],
	): DiscoveredIssuesRepository => ({
		async loadByHandoffId(_handoffId: string) {
			return issues;
		},
		save(_issue: DiscoveredIssue, _handoffId: string, _featureId: string) {
			// Mock implementation
		},
		async saveAsync(_issues: DiscoveredIssue[], _handoffId: string) {
			// Mock implementation
		},
	});

	const createMockPlanAdjuster = (): PlanAdjuster => ({
		async handleDependencyMissing(issue, feature) {
			return {
				action: "feature_created",
				newFeature: {
					id: "feat-new",
					missionId: feature.missionId,
					name: `依赖: ${issue.description}`,
					description: issue.suggestedFix || issue.description,
					status: "pending",
					fulfills: [],
					preconditions: [],
					currentWorkerSessionId: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				updatedFeatures: [
					{
						...feature,
						preconditions: [...feature.preconditions, "feat-new"],
						updatedAt: new Date().toISOString(),
					},
				],
				reasoning: `创建新 feature: ${issue.suggestedFix}`,
			};
		},
		async handleArchitectureConflict(issue, feature, conflictResult) {
			return {
				action: "no_action_needed",
				reasoning: `Architecture conflict detected: ${conflictResult.reasoning}`,
				signalId: "signal-001",
			};
		},
		async handleInfeasibleAssertion(issue, feature) {
			return {
				action: "assertion_modified",
				reasoning: `Infeasible assertion detected: ${issue.description}`,
			};
		},
	});

	describe("重大冲突 → pause + send_signal", () => {
		it("应该在检测到违反边界时暂停并发送信号", async () => {
			const repository = createMockRepository([mockIssueViolatesBoundary]);
			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const result = await handler.handle(
				"feat-001",
				"handoff-001",
				visionContext,
			);

			expect(result.action).toBe("pause");
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("send_signal");
			expect(result.suggestions[0].description).toContain("重大愿景冲突");
			expect(result.suggestions[0].metadata).toHaveProperty("conflictResults");
			expect(result.suggestions[0].metadata?.conflictResults).toBeInstanceOf(
				Array,
			);
		});

		it("应该在检测到违反约束时暂停并发送信号", async () => {
			const repository = createMockRepository([mockIssueViolatesConstraint]);
			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const result = await handler.handle(
				"feat-002",
				"handoff-002",
				visionContext,
			);

			expect(result.action).toBe("pause");
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("send_signal");
		});
	});

	describe("无冲突 → auto_adjust", () => {
		it("应该对依赖缺失且无冲突的 issue 自动调整", async () => {
			// Insert a test mission first
			db.prepare(
				`INSERT INTO missions 
         (id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
			).run(
				"mission-001",
				"测试 Mission",
				"in_progress",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			// Insert a test feature
			db.prepare(
				`INSERT INTO features 
         (id, mission_id, name, description, status, fulfills, preconditions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				"feat-001",
				"mission-001",
				"登录表单",
				"实现登录表单",
				"in_progress",
				JSON.stringify(["VAL-001"]),
				JSON.stringify([]),
				new Date().toISOString(),
				new Date().toISOString(),
			);

			const repository = createMockRepository([mockBlockingDependencyIssue]);
			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const result = await handler.handle(
				"feat-001",
				"handoff-003",
				visionContext,
			);

			expect(result.action).toBe("auto_adjust");
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("create_feature");
		});
	});

	describe("无冲突的技术调整 → continue", () => {
		it("应该对无冲突的 warning issue 继续执行", async () => {
			const repository = createMockRepository([mockIssueNoConflict]);
			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const result = await handler.handle(
				"feat-003",
				"handoff-004",
				visionContext,
			);

			// Warning issue 不阻塞，应该 continue
			expect(result.action).toBe("continue");
		});
	});

	describe("没有 visionDetector 时的降级行为", () => {
		it("应该在没有 visionDetector 时使用原有逻辑", async () => {
			const repository = createMockRepository([mockIssueViolatesBoundary]);
			const classifier = new IssuesClassifier();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				null, // No vision detector
				planAdjuster,
				db,
			);

			const result = await handler.handle("feat-004", "handoff-005");

			// 没有 vision detector，使用 classifier 的原有逻辑
			// scope_ambiguity + blocking → pause
			expect(result.action).toBe("pause");
		});
	});

	describe("没有 visionContext 时的降级行为", () => {
		it("应该在没有 visionContext 时跳过愿景检测", async () => {
			const repository = createMockRepository([mockIssueViolatesBoundary]);
			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			// 不传 visionContext
			const result = await handler.handle("feat-005", "handoff-006");

			// 应该使用 classifier 的原有逻辑
			expect(result.action).toBe("pause");
		});
	});

	describe("多个 issues 混合场景", () => {
		it("应该优先处理重大冲突", async () => {
			// Insert test mission and feature
			db.prepare(
				`INSERT INTO missions 
         (id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
			).run(
				"mission-002",
				"测试 Mission 2",
				"in_progress",
				new Date().toISOString(),
				new Date().toISOString(),
			);

			db.prepare(
				`INSERT INTO features 
         (id, mission_id, name, description, status, fulfills, preconditions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				"feat-006",
				"mission-002",
				"混合测试",
				"测试多个 issues",
				"in_progress",
				JSON.stringify(["VAL-003"]),
				JSON.stringify([]),
				new Date().toISOString(),
				new Date().toISOString(),
			);

			const repository = createMockRepository([
				mockIssueNoConflict, // warning, 无冲突
				mockIssueViolatesBoundary, // blocking, 重大冲突
				mockBlockingDependencyIssue, // blocking, 依赖缺失
			]);

			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const result = await handler.handle(
				"feat-006",
				"handoff-007",
				visionContext,
			);

			// 存在重大冲突，应该 pause
			expect(result.action).toBe("pause");
			expect(result.suggestions[0].type).toBe("send_signal");
			expect(result.suggestions[0].description).toContain("重大愿景冲突");
		});
	});

	describe("空 issues 场景", () => {
		it("应该在没有 issues 时返回 continue", async () => {
			const repository = createMockRepository([]);
			const classifier = new IssuesClassifier();
			const visionDetector = new DefaultVisionConflictDetector();
			const planAdjuster = createMockPlanAdjuster();

			const handler = new DefaultIssuesHandler(
				repository,
				classifier,
				visionDetector,
				planAdjuster,
				db,
			);

			const visionContext: VisionContext = {
				missionDocument: mockMissionDocument,
			};

			const result = await handler.handle(
				"feat-007",
				"handoff-008",
				visionContext,
			);

			expect(result.action).toBe("continue");
			expect(result.issues.blocking).toHaveLength(0);
			expect(result.issues.warning).toHaveLength(0);
			expect(result.issues.info).toHaveLength(0);
			expect(result.suggestions).toHaveLength(0);
		});
	});
});
