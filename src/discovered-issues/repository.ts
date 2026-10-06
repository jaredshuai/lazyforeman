import type { SqliteDb } from "../db/connection.js";
import type { DiscoveredIssue } from "../types/handoff.js";

/**
 * DiscoveredIssues Repository
 *
 * 管理 discovered_issues 表的 CRUD 操作
 */
export class DiscoveredIssuesRepository {
	constructor(private db: SqliteDb) {}

	/**
	 * 保存 discovered issue 到数据库
	 *
	 * @param issue - 要保存的 issue
	 * @param handoffId - 关联的 handoff ID
	 * @param featureId - 关联的 feature ID
	 */
	save(issue: DiscoveredIssue, handoffId: string, featureId: string): void {
		const stmt = this.db.prepare(`
      INSERT INTO discovered_issues (
        id, handoff_id, feature_id, severity, category, 
        description, context, suggested_fix, 
        affected_assertions_json, discovered_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

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

	/**
	 * 批量保存 discovered issues (async version for interface compatibility)
	 *
	 * @param issues - 要保存的 issues 列表
	 * @param handoffId - 关联的 handoff ID
	 */
	async saveAsync(issues: DiscoveredIssue[], handoffId: string): Promise<void> {
		// Extract featureId from the first issue's context or use a default
		// In real implementation, featureId should be passed separately
		const featureId = handoffId.replace("handoff", "feat");
		this.saveAll(issues, handoffId, featureId);
	}

	/**
	 * 批量保存 discovered issues
	 *
	 * @param issues - 要保存的 issues 列表
	 * @param handoffId - 关联的 handoff ID
	 * @param featureId - 关联的 feature ID
	 */
	saveAll(
		issues: DiscoveredIssue[],
		handoffId: string,
		featureId: string,
	): void {
		const transaction = this.db.transaction(() => {
			for (const issue of issues) {
				this.save(issue, handoffId, featureId);
			}
		});
		transaction();
	}

	/**
	 * 根据 handoff ID 查询 issues (async version for interface compatibility)
	 *
	 * @param handoffId - Handoff ID
	 * @returns 该 handoff 相关的所有 issues
	 */
	async loadByHandoffId(handoffId: string): Promise<DiscoveredIssue[]> {
		return this.findByHandoff(handoffId);
	}

	/**
	 * 根据 handoff ID 查询 issues
	 *
	 * @param handoffId - Handoff ID
	 * @returns 该 handoff 相关的所有 issues
	 */
	findByHandoff(handoffId: string): DiscoveredIssue[] {
		const stmt = this.db.prepare(`
      SELECT 
        id, severity, category, description, context, 
        suggested_fix, affected_assertions_json, discovered_at
      FROM discovered_issues
      WHERE handoff_id = ?
      ORDER BY severity, discovered_at
    `);

		const rows = stmt.all(handoffId) as Array<{
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
				? JSON.parse(row.affected_assertions_json)
				: undefined,
			discoveredAt: row.discovered_at,
		}));
	}

	/**
	 * 根据 feature ID 查询 issues
	 *
	 * @param featureId - Feature ID
	 * @returns 该 feature 相关的所有 issues
	 */
	findByFeature(featureId: string): DiscoveredIssue[] {
		const stmt = this.db.prepare(`
      SELECT 
        id, severity, category, description, context, 
        suggested_fix, affected_assertions_json, discovered_at
      FROM discovered_issues
      WHERE feature_id = ?
      ORDER BY severity, discovered_at
    `);

		const rows = stmt.all(featureId) as Array<{
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
				? JSON.parse(row.affected_assertions_json)
				: undefined,
			discoveredAt: row.discovered_at,
		}));
	}

	/**
	 * 标记 issue 为已解决
	 *
	 * @param issueId - Issue ID
	 * @param resolvedAt - 解决时间
	 */
	markResolved(issueId: string, resolvedAt: string): void {
		const stmt = this.db.prepare(`
      UPDATE discovered_issues
      SET resolved = TRUE, resolved_at = ?
      WHERE id = ?
    `);

		stmt.run(resolvedAt, issueId);
	}

	/**
	 * 查询未解决的 blocking issues
	 *
	 * @param featureId - Feature ID（可选，不提供则查询所有）
	 * @returns 未解决的 blocking issues
	 */
	findUnresolvedBlocking(featureId?: string): DiscoveredIssue[] {
		let stmt: ReturnType<SqliteDb["prepare"]>;

		if (featureId) {
			stmt = this.db.prepare(`
        SELECT 
          id, severity, category, description, context, 
          suggested_fix, affected_assertions_json, discovered_at
        FROM discovered_issues
        WHERE feature_id = ? AND severity = 'blocking' AND resolved = FALSE
        ORDER BY discovered_at
      `);
			const rows = stmt.all(featureId) as Array<{
				id: string;
				severity: string;
				category: string;
				description: string;
				context: string;
				suggested_fix: string | null;
				affected_assertions_json: string | null;
				discovered_at: string;
			}>;
			return this.mapRows(rows);
		}

		stmt = this.db.prepare(`
      SELECT 
        id, severity, category, description, context, 
        suggested_fix, affected_assertions_json, discovered_at
      FROM discovered_issues
      WHERE severity = 'blocking' AND resolved = FALSE
      ORDER BY discovered_at
    `);
		const rows = (stmt.all as () => unknown[])() as Array<{
			id: string;
			severity: string;
			category: string;
			description: string;
			context: string;
			suggested_fix: string | null;
			affected_assertions_json: string | null;
			discovered_at: string;
		}>;
		return this.mapRows(rows);
	}

	/**
	 * 获取未解决的 issues 统计摘要（按 severity 分组）
	 *
	 * @returns 按 severity 分组的未解决 issues 数量
	 */
	getUnresolvedSummary(): {
		blocking: number;
		warning: number;
		info: number;
	} {
		const stmt = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM discovered_issues
      WHERE resolved = FALSE
      GROUP BY severity
    `);

		const rows = (stmt.all as () => unknown[])() as Array<{
			severity: string;
			count: number;
		}>;

		const summary = {
			blocking: 0,
			warning: 0,
			info: 0,
		};

		for (const row of rows) {
			if (row.severity === "blocking") summary.blocking = row.count;
			else if (row.severity === "warning") summary.warning = row.count;
			else if (row.severity === "info") summary.info = row.count;
		}

		return summary;
	}

	private mapRows(
		rows: Array<{
			id: string;
			severity: string;
			category: string;
			description: string;
			context: string;
			suggested_fix: string | null;
			affected_assertions_json: string | null;
			discovered_at: string;
		}>,
	): DiscoveredIssue[] {
		return rows.map((row) => ({
			id: row.id,
			severity: row.severity as DiscoveredIssue["severity"],
			category: row.category as DiscoveredIssue["category"],
			description: row.description,
			context: row.context,
			suggestedFix: row.suggested_fix || undefined,
			affectedAssertions: row.affected_assertions_json
				? JSON.parse(row.affected_assertions_json)
				: undefined,
			discoveredAt: row.discovered_at,
		}));
	}
}
