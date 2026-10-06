import { describe, it, expect, beforeEach } from "vitest";
import { DefaultIssuesHandler } from "../../src/orchestrator/issues-handler.js";
import { IssuesClassifier } from "../../src/orchestrator/issues-classifier.js";
import { DefaultVisionConflictDetector } from "../../src/orchestrator/vision-conflict-detector.js";
import { DefaultPlanAdjuster } from "../../src/orchestrator/plan-adjuster.js";
import { TemporarySignalManager } from "../../src/signals/manager.js";
import { mockArchitectureConflictIssue } from "./fixtures/mock-issues.js";
import type { VisionContext } from "../../src/orchestrator/types.js";
import type { DiscoveredIssuesRepository } from "../../src/orchestrator/issues-handler.js";
import type { DiscoveredIssue } from "../../src/types/handoff.js";
import type { Feature } from "../../src/types/feature.js";
import type { SqliteDb } from "../../src/db/connection.js";
import type { MissionDocument } from "../../src/types/mission-document.js";

/**
 * Mock repository for testing
 */
class MockDiscoveredIssuesRepository implements DiscoveredIssuesRepository {
	private issues: Map<string, DiscoveredIssue[]> = new Map();

	async loadByHandoffId(handoffId: string): Promise<DiscoveredIssue[]> {
		return this.issues.get(handoffId) || [];
	}

	save(issue: DiscoveredIssue, handoffId: string, featureId: string): void {
		const existing = this.issues.get(handoffId) || [];
		this.issues.set(handoffId, [...existing, issue]);
	}

	async saveAsync(issues: DiscoveredIssue[], handoffId: string): Promise<void> {
		this.issues.set(handoffId, issues);
	}

	addIssues(handoffId: string, issues: DiscoveredIssue[]): void {
		this.issues.set(handoffId, issues);
	}
}

/**
 * Mock database for testing
 */
function createMockDb(): SqliteDb {
	const mockFeature: Feature = {
		id: "feat-003",
		missionId: "mission-001",
		name: "实现 JWT 认证",
		description: "实现基于 JWT 的用户认证功能",
		status: "in_progress",
		fulfills: [],
		preconditions: [],
		currentWorkerSessionId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	return {
		prepare: (sql: string) => ({
			get: (id: string) => {
				if (sql.includes("FROM features")) {
					return {
						id: mockFeature.id,
						mission_id: mockFeature.missionId,
						name: mockFeature.name,
						description: mockFeature.description,
						status: mockFeature.status,
						fulfills: JSON.stringify(mockFeature.fulfills),
						preconditions: JSON.stringify(mockFeature.preconditions),
						current_worker_session_id: mockFeature.currentWorkerSessionId,
						created_at: mockFeature.createdAt,
						updated_at: mockFeature.updatedAt,
					};
				}
				return null;
			},
			all: () => [],
			run: () => ({ changes: 1, lastInsertRowid: BigInt(1) }),
		}),
	} as unknown as SqliteDb;
}

describe("Scenario 2 Integration: Worker → Orchestrator → Signal", () => {
	let issuesHandler: DefaultIssuesHandler;
	let repository: MockDiscoveredIssuesRepository;
	let mockVisionContext: VisionContext;

	beforeEach(() => {
		repository = new MockDiscoveredIssuesRepository();
		const classifier = new IssuesClassifier();
		const visionDetector = new DefaultVisionConflictDetector();
		const signalManager = new TemporarySignalManager();
		const mockDb = createMockDb();
		const planAdjuster = new DefaultPlanAdjuster(signalManager, mockDb);

		issuesHandler = new DefaultIssuesHandler(
			repository,
			classifier,
			visionDetector,
			planAdjuster,
			mockDb,
		);

		const mockMissionDoc: MissionDocument = {
			name: "用户认证系统",
			background: [
				"需要实现用户认证功能",
				"使用 JWT 进行身份验证",
				"确保系统安全",
			],
			goal: "实现用户认证系统",
			boundaries: {
				inScope: ["JWT 认证", "登录登出"],
				outOfScope: ["社交登录", "第三方 OAuth"],
			},
			successCriteria: ["用户可以成功登录", "JWT 令牌正确生成"],
			architectureConstraints: ["使用 JWT HS256 算法", "遵循 RESTful API 设计"],
			risks: [],
			rawMarkdown: "",
		};

		mockVisionContext = {
			missionDocument: mockMissionDoc,
			kickoffNotes: undefined,
			existingDecisions: [],
		};
	});

	describe("End-to-End Flow", () => {
		it("should detect architecture conflict and send signal", async () => {
			const handoffId = "handoff-001";
			repository.addIssues(handoffId, [mockArchitectureConflictIssue]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			expect(result.action).toBe("pause");
			expect(result.issues.blocking).toHaveLength(1);
			expect(result.suggestions).toHaveLength(1);
			expect(result.suggestions[0].type).toBe("send_signal");
			// Note: signalId will be added in feat-009 when signals are persisted
		});

		it("should include signal reasoning in suggestions", async () => {
			const handoffId = "handoff-002";
			repository.addIssues(handoffId, [mockArchitectureConflictIssue]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			expect(result.suggestions[0].description).toContain("用户裁决");
		});

		it("should handle multiple architecture conflicts", async () => {
			const handoffId = "handoff-003";
			const issue2 = {
				...mockArchitectureConflictIssue,
				id: "ISSUE-021",
				description: "数据库选型冲突",
				context: "mission.md 要求 PostgreSQL，现有系统使用 MySQL",
			};

			repository.addIssues(handoffId, [mockArchitectureConflictIssue, issue2]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			expect(result.action).toBe("pause");
			expect(result.issues.blocking).toHaveLength(2);
			expect(result.suggestions.length).toBeGreaterThan(0);
		});

		it("should not send signal if no vision context provided", async () => {
			const handoffId = "handoff-004";
			repository.addIssues(handoffId, [mockArchitectureConflictIssue]);

			const result = await issuesHandler.handle("feat-003", handoffId);

			expect(result.action).toBe("pause");
		});
	});

	describe("Signal Metadata", () => {
		it("should include conflict metadata in signal suggestion", async () => {
			const handoffId = "handoff-006";
			repository.addIssues(handoffId, [mockArchitectureConflictIssue]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			const signalSuggestion = result.suggestions[0];
			expect(signalSuggestion.metadata).toBeDefined();
			expect(signalSuggestion.metadata?.signalId).toBeDefined();
		});
	});

	describe("Workflow Pause", () => {
		it("should pause workflow when major architecture conflict detected", async () => {
			const handoffId = "handoff-007";
			repository.addIssues(handoffId, [mockArchitectureConflictIssue]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			expect(result.action).toBe("pause");
		});

		it("should return classified issues with pause action", async () => {
			const handoffId = "handoff-008";
			repository.addIssues(handoffId, [mockArchitectureConflictIssue]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			expect(result.action).toBe("pause");
			expect(result.issues.blocking[0].id).toBe("ISSUE-020");
			expect(result.issues.blocking[0].category).toBe("architecture_conflict");
		});
	});

	describe("Priority: Architecture Conflict First", () => {
		it("should handle architecture conflicts before dependency issues", async () => {
			const handoffId = "handoff-009";
			const dependencyIssue = {
				id: "ISSUE-022",
				severity: "blocking" as const,
				category: "dependency_missing" as const,
				description: "缺少后端 API",
				context: "需要先实现 API",
				discoveredAt: new Date().toISOString(),
			};

			repository.addIssues(handoffId, [
				dependencyIssue,
				mockArchitectureConflictIssue,
			]);

			const result = await issuesHandler.handle(
				"feat-003",
				handoffId,
				mockVisionContext,
			);

			expect(result.action).toBe("pause");
			expect(result.suggestions[0].type).toBe("send_signal");
		});
	});
});
