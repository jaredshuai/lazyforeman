import type { SqliteDb } from "../db/connection.js";

/**
 * Step 执行日志。
 *
 * durable execution 的最小语义单元：每个 step 在 SQLite 中占一行，
 * resume 时按 `status` 决定是否重新执行。
 *
 * 封顶条款（ADR-0001）：不提供分布式锁、Saga 补偿、子 workflow、Event sourcing。
 */
export interface StepJournal {
	/** 记录 step 开始；同一 (workflowId, stepName) 重复写入会覆盖为 started */
	recordStepStart(
		workflowId: string,
		stepName: string,
		input: unknown,
	): Promise<void>;
	/** 记录 step 成功，并保存可序列化的输出 */
	recordStepSuccess(
		workflowId: string,
		stepName: string,
		output: unknown,
	): Promise<void>;
	/** 记录 step 失败，并保存错误信息 */
	recordStepFailure(
		workflowId: string,
		stepName: string,
		error: unknown,
	): Promise<void>;
	/** 取回所有已成功 step 的 输出，用于 resume 时跳过执行 */
	getCompletedSteps(workflowId: string): Promise<Map<string, unknown>>;
}

/** started 但未 success 的 step 视为崩溃残留，需要重新执行 */
export type StepStatus = "started" | "success" | "failed";

/** journal 中一行的原始形态 */
export interface StepRow {
	workflow_id: string;
	step_name: string;
	status: StepStatus;
	input_json: string | null;
	output_json: string | null;
	error_json: string | null;
	started_at: string;
	completed_at: string | null;
}

function toJson(value: unknown): string | null {
	if (value === undefined) return null;
	return JSON.stringify(value);
}

function toErrorJson(error: unknown): string | null {
	if (error === undefined) return null;
	if (error instanceof Error) {
		return JSON.stringify({
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
	}
	return JSON.stringify({ message: String(error) });
}

/**
 * 基于 better-sqlite3 的 {@link StepJournal} 实现。
 *
 * step 的输入与输出必须是 JSON 可序列化值。
 */
export class SqliteStepJournal implements StepJournal {
	constructor(private readonly db: SqliteDb) {}

	async recordStepStart(
		workflowId: string,
		stepName: string,
		input: unknown,
	): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO step_journal (workflow_id, step_name, status, input_json)
				 VALUES (?, ?, 'started', ?)
				 ON CONFLICT (workflow_id, step_name) DO UPDATE SET
				   status = 'started',
				   input_json = excluded.input_json,
				   output_json = NULL,
				   error_json = NULL,
				   started_at = datetime('now'),
				   completed_at = NULL`,
			)
			.run(workflowId, stepName, toJson(input));
	}

	async recordStepSuccess(
		workflowId: string,
		stepName: string,
		output: unknown,
	): Promise<void> {
		this.db
			.prepare(
				`UPDATE step_journal
				 SET status = 'success', output_json = ?, completed_at = datetime('now')
				 WHERE workflow_id = ? AND step_name = ?`,
			)
			.run(toJson(output), workflowId, stepName);
	}

	async recordStepFailure(
		workflowId: string,
		stepName: string,
		error: unknown,
	): Promise<void> {
		this.db
			.prepare(
				`UPDATE step_journal
				 SET status = 'failed', error_json = ?, completed_at = datetime('now')
				 WHERE workflow_id = ? AND step_name = ?`,
			)
			.run(toErrorJson(error), workflowId, stepName);
	}

	async getCompletedSteps(workflowId: string): Promise<Map<string, unknown>> {
		const rows = this.db
			.prepare(
				`SELECT step_name, output_json FROM step_journal
				 WHERE workflow_id = ? AND status = 'success'`,
			)
			.all(workflowId) as Array<Pick<StepRow, "step_name" | "output_json">>;

		const completed = new Map<string, unknown>();
		for (const row of rows) {
			completed.set(
				row.step_name,
				row.output_json === null ? undefined : JSON.parse(row.output_json),
			);
		}
		return completed;
	}

	/**
	 * 读取某个 step 的当前日志行，用于断言与排障。
	 *
	 * @param workflowId - workflow 标识
	 * @param stepName - step 名
	 */
	getStep(workflowId: string, stepName: string): StepRow | undefined {
		return this.db
			.prepare(
				`SELECT workflow_id, step_name, status, input_json, output_json, error_json, started_at, completed_at
				 FROM step_journal WHERE workflow_id = ? AND step_name = ?`,
			)
			.get(workflowId, stepName) as StepRow | undefined;
	}
}
