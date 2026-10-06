/**
 * Issues Handler
 *
 * Handles discovered issues from Worker handoffs.
 * Integrates IssuesClassifier, VisionConflictDetector, and PlanAdjuster.
 */

import type { SqliteDb } from "../db/connection.js";
import type { Assertion } from "../types/assertion.js";
import type { Feature } from "../types/feature.js";
import type { DiscoveredIssue } from "../types/handoff.js";
import type { IssuesClassifier } from "./issues-classifier.js";
import type {
	IssuesHandler,
	IssuesHandlingResult,
	PlanAdjuster,
	VisionConflictDetector,
	VisionContext,
} from "./types.js";

export type { IssuesHandlingResult } from "./types.js";

/**
 * Discovered Issues Repository
 */
export interface DiscoveredIssuesRepository {
	/**
	 * Load issues by handoff ID
	 */
	loadByHandoffId(handoffId: string): Promise<DiscoveredIssue[]>;

	/**
	 * Save a single issue (matches actual repository signature)
	 */
	save(issue: DiscoveredIssue, handoffId: string, featureId: string): void;

	/**
	 * Save multiple issues asynchronously
	 */
	saveAsync(issues: DiscoveredIssue[], handoffId: string): Promise<void>;
}

/**
 * Default Issues Handler implementation
 */
export class DefaultIssuesHandler implements IssuesHandler {
	constructor(
		private readonly repository: DiscoveredIssuesRepository,
		private readonly classifier: IssuesClassifier,
		private readonly visionDetector: VisionConflictDetector | null,
		private readonly planAdjuster: PlanAdjuster,
		private readonly db: SqliteDb,
	) {}

	async handle(
		featureId: string,
		handoffId: string,
		visionContext?: VisionContext,
	): Promise<IssuesHandlingResult> {
		// 1. Load issues from repository
		const issues = await this.repository.loadByHandoffId(handoffId);

		if (issues.length === 0) {
			return {
				action: "continue",
				issues: { blocking: [], warning: [], info: [] },
				suggestions: [],
			};
		}

		// 2. Classify issues
		const classified = this.classifier.classify(issues);

		// 3. Vision conflict detection for ALL blocking issues (feat-005)
		if (
			this.visionDetector &&
			visionContext &&
			classified.blocking.length > 0
		) {
			// Run vision conflict detection on all blocking issues
			const detector = this.visionDetector;
			const conflictResults = await Promise.all(
				classified.blocking.map((issue) =>
					detector.detect(issue, visionContext),
				),
			);

			// Check for major conflicts
			const majorConflictIndices = conflictResults
				.map((r, i) => (r.conflictLevel === "major" ? i : -1))
				.filter((i) => i !== -1);

			if (majorConflictIndices.length > 0) {
				// For architecture_conflict issues with major conflicts, send signals
				const architectureConflictIndices = majorConflictIndices.filter(
					(i) => classified.blocking[i].category === "architecture_conflict",
				);

				if (architectureConflictIndices.length > 0) {
					// Load feature and send signals via plan adjuster
					const feature = await this.loadFeature(featureId);
					const adjustmentResults = await Promise.all(
						architectureConflictIndices.map((i) =>
							this.planAdjuster.handleArchitectureConflict(
								classified.blocking[i],
								feature,
								conflictResults[i],
							),
						),
					);

					// Return pause with all major conflicts
					return {
						action: "pause",
						issues: classified,
						suggestions: adjustmentResults.map((r) => ({
							type: "send_signal",
							description: r.reasoning,
							metadata: {
								signalId: r.signalId,
							},
						})),
					};
				}

				// For other issue types with major conflicts, return without sending signals
				return {
					action: "pause",
					issues: classified,
					suggestions: [
						{
							type: "send_signal",
							description: "发现重大愿景冲突，需要用户裁决",
							metadata: {
								conflictResults: majorConflictIndices.map((i) => ({
									issueId: classified.blocking[i].id,
									conflictLevel: conflictResults[i].conflictLevel,
									reasoning: conflictResults[i].reasoning,
									recommendation: conflictResults[i].recommendation,
								})),
							},
						},
					],
				};
			}
		}

		// 4. Handle architecture_conflict (Scenario 2)
		const architectureIssues = classified.blocking.filter(
			(i) => i.category === "architecture_conflict",
		);

		if (architectureIssues.length > 0 && this.visionDetector && visionContext) {
			const feature = await this.loadFeature(featureId);

			// Run vision conflict detection
			if (!this.visionDetector) {
				throw new Error("Vision conflict detector not configured");
			}

			const conflictResults = await Promise.all(
				architectureIssues.map((issue) =>
					this.visionDetector!.detect(issue, visionContext),
				),
			);

			// If any major conflicts, send signal and pause
			const majorConflicts = conflictResults.filter(
				(r) => r.conflictLevel === "major",
			);

			if (majorConflicts.length > 0) {
				const adjustmentResults = await Promise.all(
					architectureIssues.map((issue, i) =>
						this.planAdjuster.handleArchitectureConflict(
							issue,
							feature,
							conflictResults[i],
						),
					),
				);

				return {
					action: "pause",
					issues: classified,
					suggestions: adjustmentResults.map((r) => ({
						type: "send_signal",
						description: r.reasoning,
						metadata: {
							signalId: r.signalId,
						},
					})),
				};
			}
		}

		// 5. Handle dependency_missing (Scenario 1) and assertion_infeasible (Scenario 3)
		const dependencyIssues = classified.blocking.filter(
			(i) => i.category === "dependency_missing",
		);
		const infeasibleIssues = classified.blocking.filter(
			(i) => i.category === "assertion_infeasible",
		);

		if (dependencyIssues.length > 0 || infeasibleIssues.length > 0) {
			const suggestions: Array<{
				type: "create_feature" | "update_assertion";
				description: string;
				metadata?: Record<string, unknown>;
			}> = [];

			// Handle dependency_missing issues
			if (dependencyIssues.length > 0) {
				const feature = await this.loadFeature(featureId);

				// Check vision conflict if detector available
				if (this.visionDetector && visionContext) {
					for (const issue of dependencyIssues) {
						const conflictResult = await this.visionDetector.detect(
							issue,
							visionContext,
						);

						// If major conflict, pause instead of auto-adjust
						if (conflictResult.conflictLevel === "major") {
							// Send signal via plan adjuster
							const adjustmentResult =
								await this.planAdjuster.handleArchitectureConflict(
									issue,
									feature,
									conflictResult,
								);

							return {
								action: "pause",
								issues: classified,
								suggestions: [
									{
										type: "send_signal",
										description: adjustmentResult.reasoning,
										metadata: {
											signalId: adjustmentResult.signalId,
										},
									},
								],
							};
						}
					}
				}

				// Auto-adjust: generate new features for dependencies
				// Process sequentially to avoid ID conflicts
				let currentFeature = feature;

				for (const issue of dependencyIssues) {
					const result = await this.planAdjuster.handleDependencyMissing(
						issue,
						currentFeature,
					);

					suggestions.push({
						type: "create_feature",
						description: result.reasoning,
						metadata: {
							newFeatureId: result.newFeature?.id,
							updatedFeatureIds: result.updatedFeatures?.map((f) => f.id),
						},
					});

					// Use the updated feature for the next iteration
					if (result.updatedFeatures && result.updatedFeatures.length > 0) {
						currentFeature = result.updatedFeatures[0];
					}
				}
			}

			// Handle assertion_infeasible issues
			if (infeasibleIssues.length > 0) {
				const feature = await this.loadFeature(featureId);

				for (const issue of infeasibleIssues) {
					const result = await this.planAdjuster.handleInfeasibleAssertion(
						issue,
						feature,
					);

					suggestions.push({
						type: "update_assertion",
						description: result.reasoning,
						metadata: {
							originalIssueId: issue.id,
							affectedAssertions: issue.affectedAssertions || [],
							modifiedAssertions: result.modifiedAssertions?.map(
								(a: Assertion) => a.id,
							),
							updatedFeatureIds: result.updatedFeatures?.map((f) => f.id),
						},
					});
				}
			}

			return {
				action: "auto_adjust",
				issues: classified,
				suggestions,
			};
		}

		// 5. Decide action and generate suggestions for other scenarios
		const action = this.classifier.decideAction(classified);
		const suggestions = this.classifier.generateSuggestions(classified, action);

		return {
			action,
			issues: classified,
			suggestions,
		};
	}

	/**
	 * Load feature from database
	 */
	private async loadFeature(featureId: string): Promise<Feature> {
		const row = this.db
			.prepare(
				`SELECT id, mission_id, name, description, status, 
             fulfills, preconditions, current_worker_session_id,
             created_at, updated_at
         FROM features WHERE id = ?`,
			)
			.get(featureId) as {
			id: string;
			mission_id: string;
			name: string;
			description: string;
			status: string;
			fulfills: string;
			preconditions: string;
			current_worker_session_id: string | null;
			created_at: string;
			updated_at: string;
		};

		if (!row) {
			throw new Error(`Feature not found: ${featureId}`);
		}

		return {
			id: row.id,
			missionId: row.mission_id,
			name: row.name,
			description: row.description,
			status: row.status as Feature["status"],
			fulfills: JSON.parse(row.fulfills) as string[],
			preconditions: JSON.parse(row.preconditions) as string[],
			currentWorkerSessionId: row.current_worker_session_id || null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}
}

/**
 * SQLite-backed Discovered Issues Repository
 */
export class SqliteDiscoveredIssuesRepository
	implements DiscoveredIssuesRepository
{
	constructor(private readonly db: SqliteDb) {}

	async loadByHandoffId(handoffId: string): Promise<DiscoveredIssue[]> {
		const rows = this.db
			.prepare(
				`SELECT id, severity, category, description, context, 
             suggested_fix, affected_assertions_json, discovered_at
         FROM discovered_issues 
         WHERE handoff_id = ?`,
			)
			.all(handoffId) as Array<{
			id: string;
			severity: string;
			category: string;
			description: string;
			context: string;
			suggested_fix: string | null;
			affected_assertions_json: string | null;
			discovered_at: string;
		}>;

		return rows.map((row) => ({
			id: row.id,
			severity: row.severity as DiscoveredIssue["severity"],
			category: row.category as DiscoveredIssue["category"],
			description: row.description,
			context: row.context,
			suggestedFix: row.suggested_fix || undefined,
			affectedAssertions: row.affected_assertions_json
				? (JSON.parse(row.affected_assertions_json) as string[])
				: undefined,
			discoveredAt: row.discovered_at,
		}));
	}

	async save(
		issue: DiscoveredIssue,
		handoffId: string,
		featureId: string,
	): Promise<void> {
		const stmt = this.db.prepare(
			`INSERT INTO discovered_issues (
        id, handoff_id, feature_id, severity, category, 
        description, context, suggested_fix, affected_assertions_json, 
        discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);

		stmt.run(
			issue.id,
			handoffId,
			featureId,
			issue.severity,
			issue.category,
			issue.description,
			issue.context,
			issue.suggestedFix || null,
			issue.affectedAssertions
				? JSON.stringify(issue.affectedAssertions)
				: null,
			issue.discoveredAt,
		);
	}

	async saveAsync(issues: DiscoveredIssue[], handoffId: string): Promise<void> {
		// Get feature_id from handoff
		const handoffRow = this.db
			.prepare(`SELECT feature_id FROM handoffs WHERE id = ?`)
			.get(handoffId) as { feature_id: string } | undefined;

		if (!handoffRow) {
			throw new Error(`Handoff not found: ${handoffId}`);
		}

		for (const issue of issues) {
			await this.save(issue, handoffId, handoffRow.feature_id);
		}
	}
}
