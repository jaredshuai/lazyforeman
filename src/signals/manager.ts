import type { Signal, SignalResolution } from "./types.js";
import type { SqliteDb } from "../db/connection.js";
import { SignalResolutionSchema } from "./validation.js";

/**
 * Signal Manager 接口
 *
 * feat-007: 实现 send()
 * feat-010: 实现 recv() 和持久化
 */
export interface SignalManager {
	/**
	 * 发送信号
	 *
	 * @param signal - Signal 数据（不含 id 和 createdAt）
	 * @returns Signal ID
	 */
	send(signal: Omit<Signal, "id" | "createdAt">): Promise<string>;

	/**
	 * 接收信号解决（feat-010 实现）
	 *
	 * @param signalId - Signal ID
	 * @param resolution - 解决方案
	 */
	recv(signalId: string, resolution: SignalResolution): Promise<void>;

	/**
	 * 查询所有 pending signals
	 */
	listPending(): Promise<Signal[]>;

	/**
	 * 根据 ID 查询 signal
	 */
	get(signalId: string): Promise<Signal | null>;

	/**
	 * 检查并标记超时的 signals
	 */
	checkTimeouts(): Promise<string[]>;
}

/**
 * 默认 Signal Manager 实现（feat-010）
 *
 * 持久化 signals 到 SQLite
 */
export class DefaultSignalManager implements SignalManager {
	private idCounter = 0; // 内存计数器，确保同一实例的唯一性

	constructor(private readonly db: SqliteDb) {
		// 初始化计数器为数据库中的最大序号
		this.initializeCounter();
	}

	/**
	 * 初始化 ID 计数器
	 */
	private initializeCounter(): void {
		const row = this.db
			.prepare(
				`SELECT id FROM signals 
         WHERE id LIKE 'SIG-%' 
         ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC 
         LIMIT 1`,
			)
			.get() as { id: string } | undefined;

		if (row?.id) {
			const match = row.id.match(/^SIG-(\d+)$/);
			if (match) {
				this.idCounter = Number.parseInt(match[1], 10);
			}
		}
	}

	/**
	 * 发送信号
	 */
	send(signal: Omit<Signal, "id" | "createdAt">): Promise<string> {
		// 1. 生成唯一 ID
		this.idCounter++;
		const signalId = `SIG-${String(this.idCounter).padStart(3, "0")}`;

		// 2. 构造完整 signal
		const fullSignal: Signal = {
			id: signalId,
			...signal,
			createdAt: new Date().toISOString(),
		};

		// 3. 持久化到 SQLite
		this.db
			.prepare(
				`INSERT INTO signals (
          id, type, status, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
			)
			.run(
				fullSignal.id,
				fullSignal.type,
				fullSignal.status,
				JSON.stringify(fullSignal.payload),
				fullSignal.createdAt,
			);

		// 4. 记录日志
		console.log(`[Signal] Sent: ${signalId} (type: ${signal.type})`);
		console.log(`  Feature: ${signal.payload.featureId}`);
		console.log(`  Issue: ${signal.payload.issueId}`);

		// 返回 Promise 以保持接口兼容性
		return Promise.resolve(signalId);
	}

	/**
	 * 接收信号解决（feat-010）
	 */
	async recv(signalId: string, resolution: SignalResolution): Promise<void> {
		// 1. 验证输入
		const validationResult = SignalResolutionSchema.safeParse(resolution);
		if (!validationResult.success) {
			throw new Error(`Invalid resolution: ${validationResult.error.message}`);
		}

		// 2. 验证 signal 存在且状态为 pending
		const signal = await this.get(signalId);

		if (!signal) {
			throw new Error(`Signal ${signalId} not found`);
		}

		if (signal.status !== "pending") {
			throw new Error(
				`Signal ${signalId} is not pending (status: ${signal.status})`,
			);
		}

		// 3. 更新信号状态
		await this.resolveSignal(signalId, resolution);

		// 4. 记录日志
		console.log(
			`[Signal] Received: ${signalId} (decision: ${resolution.decision})`,
		);
		console.log(`  Reasoning: ${resolution.reasoning}`);

		// 5. 如果决策是 modify，记录修改（具体应用由 workflow 处理）
		if (resolution.decision === "modify" && resolution.modifiedPlan) {
			console.log(
				"[Signal] Modified plan recorded, will be applied by workflow",
			);
		}
	}

	/**
	 * 查询所有 pending signals
	 */
	async listPending(): Promise<Signal[]> {
		const rows = this.db
			.prepare(
				`SELECT * FROM signals WHERE status = 'pending' ORDER BY created_at ASC`,
			)
			.all() as Array<{
			id: string;
			type: string;
			status: string;
			payload_json: string;
			created_at: string;
			resolved_at: string | null;
			resolution_json: string | null;
		}>;

		return rows.map((row) => this.rowToSignal(row));
	}

	/**
	 * 根据 ID 查询 signal
	 */
	async get(signalId: string): Promise<Signal | null> {
		const row = this.db
			.prepare(`SELECT * FROM signals WHERE id = ?`)
			.get(signalId) as
			| {
					id: string;
					type: string;
					status: string;
					payload_json: string;
					created_at: string;
					resolved_at: string | null;
					resolution_json: string | null;
			  }
			| undefined;

		return row ? this.rowToSignal(row) : null;
	}

	/**
	 * 检查并标记超时的 signals
	 */
	async checkTimeouts(): Promise<string[]> {
		const timeout = 24 * 60 * 60 * 1000; // 24 小时
		const cutoff = new Date(Date.now() - timeout).toISOString();

		// 查询超时的 pending signals
		const rows = this.db
			.prepare(
				`SELECT id FROM signals
         WHERE status = 'pending' AND created_at < ?`,
			)
			.all(cutoff) as Array<{ id: string }>;

		const timeoutIds = rows.map((r) => r.id);

		// 标记为 abandoned
		if (timeoutIds.length > 0) {
			const placeholders = timeoutIds.map(() => "?").join(",");
			this.db
				.prepare(
					`UPDATE signals SET status = 'abandoned'
           WHERE id IN (${placeholders})`,
				)
				.run(...timeoutIds);
		}

		return timeoutIds;
	}

	/**
	 * 更新信号状态为 resolved
	 */
	private async resolveSignal(
		signalId: string,
		resolution: SignalResolution,
	): Promise<void> {
		this.db
			.prepare(
				`UPDATE signals
         SET status = 'resolved',
             resolved_at = ?,
             resolution_json = ?
         WHERE id = ?`,
			)
			.run(new Date().toISOString(), JSON.stringify(resolution), signalId);
	}

	/**
	 * 转换数据库行为 Signal
	 */
	private rowToSignal(row: {
		id: string;
		type: string;
		status: string;
		payload_json: string;
		created_at: string;
		resolved_at: string | null;
		resolution_json: string | null;
	}): Signal {
		return {
			id: row.id,
			type: row.type as Signal["type"],
			status: row.status as Signal["status"],
			payload: JSON.parse(row.payload_json),
			createdAt: row.created_at,
			resolvedAt: row.resolved_at || undefined,
			resolution: row.resolution_json
				? JSON.parse(row.resolution_json)
				: undefined,
		};
	}
}

/**
 * 临时 Signal Manager 实现（仅用于 feat-007 测试）
 *
 * @deprecated 使用 DefaultSignalManager 替代
 */
export class TemporarySignalManager implements SignalManager {
	/**
	 * 发送信号（临时实现：仅打印日志）
	 */
	async send(signal: Omit<Signal, "id" | "createdAt">): Promise<string> {
		const signalId = `SIG-${Date.now()}`;

		// 临时：仅打印日志
		console.log(`[Signal] Sent: ${signalId}`, {
			type: signal.type,
			status: signal.status,
			featureId: signal.payload.featureId,
			issueId: signal.payload.issueId,
			conflictLevel: signal.payload.conflictDetails.conflictLevel,
		});

		return signalId;
	}

	async listPending(): Promise<Signal[]> {
		return [];
	}

	async get(_signalId: string): Promise<Signal | null> {
		return null;
	}

	async checkTimeouts(): Promise<string[]> {
		return [];
	}

	async recv(_signalId: string, _resolution: SignalResolution): Promise<void> {
		throw new Error("TemporarySignalManager does not support recv()");
	}
}
