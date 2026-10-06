import type { DiscoveredIssue } from "../types/handoff.js";
import type { ConflictDetectionResult } from "../signals/types.js";
import type { SignalManager } from "../signals/manager.js";
import type { Feature } from "../types/feature.js";
import type { Assertion } from "../types/assertion.js";
import type { SqliteDb } from "../db/connection.js";

/**
 * Plan 调整结果
 */
export interface PlanAdjustmentResult {
	/** 调整行动 */
	action:
		| "feature_created"
		| "create_new_feature"
		| "update_assertions"
		| "assertion_modified"
		| "no_action_needed";
	/** 推理过程 */
	reasoning: string;
	/** 新的 Feature（如果 action 是 feature_created） */
	newFeature?: Feature;
	/** 更新的 Features（如果修改了现有 features） */
	updatedFeatures?: Feature[];
	/** 修改的 Assertions（如果标记为 infeasible） */
	modifiedAssertions?: Assertion[];
	/** 信号 ID（如果发送了 signal） */
	signalId?: string;
}

/**
 * Plan Adjuster 接口（feat-006）
 *
 * 处理不同场景下的计划调整
 */
export interface PlanAdjuster {
	/**
	 * 处理依赖缺失（场景 1）
	 *
	 * @param issue - 发现的问题
	 * @param originalFeature - 原始 Feature
	 * @returns 调整结果
	 */
	handleDependencyMissing(
		issue: DiscoveredIssue,
		originalFeature: Feature,
	): Promise<PlanAdjustmentResult>;

	/**
	 * 处理架构假设错误（场景 2）
	 *
	 * @param issue - 发现的问题
	 * @param originalFeature - 原始 Feature
	 * @param conflictResult - 冲突检测结果
	 * @returns 调整结果
	 */
	handleArchitectureConflict(
		issue: DiscoveredIssue,
		originalFeature: Feature,
		conflictResult: ConflictDetectionResult,
	): Promise<PlanAdjustmentResult>;

	/**
	 * 处理断言不可行（场景 3）
	 *
	 * @param issue - assertion_infeasible type issue
	 * @param originalFeature - Feature that discovered the issue
	 * @returns 调整结果
	 */
	handleInfeasibleAssertion(
		issue: DiscoveredIssue,
		originalFeature: Feature,
	): Promise<PlanAdjustmentResult>;
}

/**
 * 默认 Plan Adjuster 实现
 */
export class DefaultPlanAdjuster implements PlanAdjuster {
	constructor(
		private signalManager: SignalManager,
		private db: SqliteDb,
	) {}

	/**
	 * 处理依赖缺失（场景 1）
	 */
	async handleDependencyMissing(
		issue: DiscoveredIssue,
		originalFeature: Feature,
	): Promise<PlanAdjustmentResult> {
		// 1. Generate new feature ID
		const newFeatureId = await this.generateFeatureId();

		// 2. Get mission_id from original feature
		const missionId = originalFeature.missionId;

		// 3. Create new feature
		const newFeature: Feature = {
			id: newFeatureId,
			missionId: missionId,
			name: this.generateFeatureName(issue.description), // Use description for name
			description: this.generateFeatureDescription(issue),
			status: "pending",
			fulfills: [], // Dependency features may not directly fulfill assertions
			preconditions: [],
			currentWorkerSessionId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		// 4. Update original feature's preconditions
		const updatedOriginalFeature: Feature = {
			...originalFeature,
			preconditions: [...originalFeature.preconditions, newFeatureId],
			updatedAt: new Date().toISOString(),
		};

		// 5. Persist to SQLite
		await this.saveFeature(newFeature, missionId);
		await this.updateFeature(updatedOriginalFeature);

		return {
			action: "feature_created",
			newFeature,
			updatedFeatures: [updatedOriginalFeature],
			reasoning: `自动创建依赖 feature: ${newFeatureId}`,
		};
	}

	/**
	 * 处理架构假设错误（场景 2）
	 */
	async handleArchitectureConflict(
		issue: DiscoveredIssue,
		originalFeature: Feature,
		conflictResult: ConflictDetectionResult,
	): Promise<PlanAdjustmentResult> {
		// 场景 2：发送 signal，暂停 workflow

		const signalId = await this.signalManager.send({
			type: "architecture_conflict",
			status: "pending",
			payload: {
				featureId: originalFeature.id,
				issueId: issue.id,
				conflictDetails: conflictResult,
				suggestedActions: [
					"修改 mission.md 以匹配现有架构",
					"升级现有架构以符合 mission.md",
					"寻找折中方案",
				],
			},
		});

		return {
			action: "no_action_needed",
			reasoning: `已发送 signal ${signalId}，等待用户裁决`,
			signalId,
		};
	}

	/**
	 * 处理断言不可行（场景 3）
	 */
	async handleInfeasibleAssertion(
		issue: DiscoveredIssue,
		originalFeature: Feature,
	): Promise<PlanAdjustmentResult> {
		// 1. 识别受影响的断言
		const affectedAssertionIds = issue.affectedAssertions || [];

		if (affectedAssertionIds.length === 0) {
			return {
				action: "no_action_needed",
				reasoning: "issue 未指定受影响的断言",
			};
		}

		// 2. 加载断言
		const assertions = await this.loadAssertions(affectedAssertionIds);

		if (assertions.length === 0) {
			return {
				action: "no_action_needed",
				reasoning: "未找到受影响的断言",
			};
		}

		// 3. 修正断言（标记为 infeasible 或修改描述）
		const modifiedAssertions = assertions.map((assertion) => ({
			...assertion,
			status: "infeasible" as const,
			notes: `Worker 报告不可行: ${issue.description}`,
			updatedAt: new Date().toISOString(),
		}));

		// 4. 持久化修改
		await this.updateAssertions(modifiedAssertions);

		// 5. 更新 Feature（移除 fulfills 中的不可行断言）
		const updatedFeature: Feature = {
			...originalFeature,
			fulfills: originalFeature.fulfills.filter(
				(id) => !affectedAssertionIds.includes(id),
			),
			updatedAt: new Date().toISOString(),
		};
		await this.updateFeature(updatedFeature);

		// 6. 重新验证覆盖（简化版，只返回结果）
		// 使用断言的 mission_id 进行验证
		const missionId = assertions[0].missionId;
		if (!missionId) {
			// 如果没有 mission_id，直接返回成功
			return {
				action: "assertion_modified",
				modifiedAssertions,
				updatedFeatures: [updatedFeature],
				reasoning: `成功修正 ${affectedAssertionIds.length} 个不可行断言`,
			};
		}

		const coverageIssues =
			await this.validateCoverageAfterModification(missionId);

		if (coverageIssues.length > 0) {
			return {
				action: "assertion_modified",
				modifiedAssertions,
				updatedFeatures: [updatedFeature],
				reasoning: `修正了 ${affectedAssertionIds.length} 个不可行断言，但覆盖验证失败：${coverageIssues.join(", ")}`,
			};
		}

		return {
			action: "assertion_modified",
			modifiedAssertions,
			updatedFeatures: [updatedFeature],
			reasoning: `成功修正 ${affectedAssertionIds.length} 个不可行断言`,
		};
	}

	/**
	 * 加载断言
	 */
	private async loadAssertions(ids: string[]): Promise<Assertion[]> {
		const placeholders = ids.map(() => "?").join(",");
		const rows = this.db
			.prepare(`SELECT * FROM assertions WHERE id IN (${placeholders})`)
			.all(...ids) as Array<{
			id: string;
			description: string;
			status: string;
			type?: string;
			notes?: string;
			claimed_by?: string;
			mission_id?: string;
			created_at: string;
			updated_at: string;
		}>;

		return rows.map((row) => ({
			id: row.id,
			description: row.description,
			status: row.status as Assertion["status"],
			type: row.type as Assertion["type"],
			notes: row.notes || undefined,
			claimedBy: row.claimed_by || undefined,
			missionId: row.mission_id || undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	/**
	 * Extract requirement description from issue
	 */
	private extractRequirement(issue: DiscoveredIssue): string {
		return issue.suggestedFix || issue.description;
	}

	/**
	 * Generate feature name (truncate to 50 chars)
	 */
	private generateFeatureName(requirement: string): string {
		const maxLength = 50;
		const trimmed = requirement.trim();

		if (trimmed.length <= maxLength) {
			return trimmed;
		}

		return `${trimmed.substring(0, maxLength - 3)}...`;
	}

	/**
	 * Generate feature description from issue
	 */
	private generateFeatureDescription(issue: DiscoveredIssue): string {
		let description = `实现依赖：${issue.description}\n\n`;

		if (issue.context) {
			description += `上下文：${issue.context}\n\n`;
		}

		if (issue.suggestedFix) {
			description += `建议方案：${issue.suggestedFix}`;
		}

		return description;
	}

	/**
	 * Generate unique feature ID (feat-001, feat-002, ...)
	 */
	private async generateFeatureId(): Promise<string> {
		const result = this.db
			.prepare("SELECT COUNT(*) as count FROM features")
			.get() as { count: number };

		const nextId = result.count + 1;
		return `feat-${String(nextId).padStart(3, "0")}`;
	}

	/**
	 * Get mission_id for a feature
	 */
	private async getMissionIdForFeature(featureId: string): Promise<string> {
		const row = this.db
			.prepare("SELECT mission_id FROM features WHERE id = ?")
			.get(featureId) as { mission_id: string } | undefined;

		if (!row) {
			throw new Error(`Feature not found: ${featureId}`);
		}

		return row.mission_id;
	}

	/**
	 * Save new feature to database
	 */
	private async saveFeature(
		feature: Feature,
		missionId: string,
	): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO features (
        id, mission_id, name, description, status, 
        fulfills, preconditions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				feature.id,
				missionId,
				feature.name,
				feature.description,
				feature.status,
				JSON.stringify(feature.fulfills),
				JSON.stringify(feature.preconditions),
				feature.createdAt,
				feature.updatedAt,
			);
	}

	/**
	 * 更新断言
	 */
	private async updateAssertions(assertions: Assertion[]): Promise<void> {
		const stmt = this.db.prepare(
			`UPDATE assertions SET
        status = ?,
        notes = ?,
        updated_at = ?
       WHERE id = ?`,
		);

		for (const assertion of assertions) {
			stmt.run(
				assertion.status,
				assertion.notes || null,
				assertion.updatedAt,
				assertion.id,
			);
		}
	}

	/**
	 * 更新 Feature
	 */
	private async updateFeature(feature: Feature): Promise<void> {
		this.db
			.prepare(
				`UPDATE features SET
        fulfills = ?,
        preconditions = ?,
        updated_at = ?
       WHERE id = ?`,
			)
			.run(
				JSON.stringify(feature.fulfills),
				JSON.stringify(feature.preconditions),
				feature.updatedAt,
				feature.id,
			);
	}

	/**
	 * 重新验证覆盖（简化版）
	 */
	private async validateCoverageAfterModification(
		missionId: string,
	): Promise<string[]> {
		// 加载所有断言
		const assertionRows = this.db
			.prepare("SELECT * FROM assertions WHERE mission_id = ?")
			.all(missionId) as Array<{
			id: string;
			status: string;
			claimed_by?: string;
		}>;

		// 过滤掉 infeasible 断言
		const feasibleAssertions = assertionRows.filter(
			(a) => a.status !== "infeasible",
		);

		// 检查每个 feasible 断言是否被认领
		const violations: string[] = [];
		for (const assertion of feasibleAssertions) {
			if (!assertion.claimed_by) {
				violations.push(`断言 ${assertion.id} 无人认领`);
			}
		}

		return violations;
	}
}
