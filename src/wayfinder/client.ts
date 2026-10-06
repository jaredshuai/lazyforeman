import type { SqliteDb } from "../db/connection.js";
import type { WayfinderResult, WayfinderConfig } from "../types/wayfinder.js";

/**
 * Wayfinder Client 接口
 */
export interface WayfinderClient {
	/**
	 * 探索架构：搜索组件、模块、依赖关系
	 */
	exploreArchitecture(query: string): Promise<WayfinderResult>;

	/**
	 * 搜索模式：搜索代码模式、惯用法、示例
	 */
	searchPattern(query: string): Promise<WayfinderResult>;

	/**
	 * 清除过期缓存
	 */
	clearExpiredCache(): Promise<number>;
}

/**
 * Wayfinder Client 实现
 *
 * 封装三种工具：codegraph、codebase-memory、fast-context
 * 提供智能缓存 + 降级策略
 */
export class DefaultWayfinderClient implements WayfinderClient {
	constructor(
		private readonly db: SqliteDb,
		private readonly config: WayfinderConfig,
	) {}

	async exploreArchitecture(query: string): Promise<WayfinderResult> {
		// 1. 检查缓存
		const cached = this.checkCache(query);
		if (cached) return cached;

		// 2. 优先使用 codegraph（最适合架构探索）
		const startTime = Date.now();
		try {
			const result = await this.callCodeGraph(query);
			result.metadata.searchTimeMs = Date.now() - startTime;
			this.saveCache(query, result, "codegraph");
			return result;
		} catch (error) {
			console.warn(
				`CodeGraph failed for query "${query}", falling back to codebase-memory:`,
				error,
			);
			// 降级到 codebase-memory
			return this.fallbackToCodebaseMemory(query, startTime);
		}
	}

	async searchPattern(query: string): Promise<WayfinderResult> {
		// 1. 检查缓存
		const cached = this.checkCache(query);
		if (cached) return cached;

		// 2. 优先使用 fast-context（最适合语义搜索）
		const startTime = Date.now();
		try {
			const result = await this.callFastContext(query);
			result.metadata.searchTimeMs = Date.now() - startTime;
			this.saveCache(query, result, "fast-context");
			return result;
		} catch (error) {
			console.warn(
				`Fast-context failed for query "${query}", falling back to codebase-memory:`,
				error,
			);
			// 降级到 codebase-memory
			return this.fallbackToCodebaseMemory(query, startTime);
		}
	}

	private checkCache(query: string): WayfinderResult | null {
		if (!this.config.enableCache) return null;

		const row = this.db
			.prepare(
				`
      SELECT result_json, tool_used, created_at
      FROM wayfinder_cache
      WHERE query = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
      LIMIT 1
    `,
			)
			.get(query) as
			| { result_json: string; tool_used: string; created_at: string }
			| undefined;

		if (!row) return null;

		const result = JSON.parse(row.result_json) as WayfinderResult;
		result.metadata.cached = true;
		return result;
	}

	private saveCache(
		query: string,
		result: WayfinderResult,
		tool: string,
	): void {
		if (!this.config.enableCache) return;

		const expiresAt = this.config.cacheExpiryMs
			? new Date(Date.now() + this.config.cacheExpiryMs).toISOString()
			: null;

		this.db
			.prepare(
				`
      INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
      VALUES (?, ?, ?, datetime('now'), ?)
    `,
			)
			.run(query, JSON.stringify(result), tool, expiresAt);
	}

	/**
	 * 调用 codegraph___codegraph_explore
	 *
	 * 返回格式是包含源码的文本，需要解析出文件列表。
	 * 当前简化实现：直接保存原始输出，不尝试精确解析。
	 */
	private async callCodeGraph(_query: string): Promise<WayfinderResult> {
		// 注意：这里需要动态导入或调用 MCP 工具
		// 由于我们在 TypeScript 环境中，实际调用需要通过 MCP 协议
		// 这里先实现接口框架，实际调用留给运行时

		throw new Error(
			"callCodeGraph requires MCP tool invocation - to be implemented by runtime",
		);

		// 预期实现示例（伪代码）：
		// const output = await mcpClient.call('codegraph___codegraph_explore', {
		//   projectPath: this.config.projectPath,
		//   query,
		// });
		//
		// return this.parseCodeGraphOutput(query, output);
	}

	/**
	 * 调用 fast-context___fast_context_search
	 *
	 * 返回格式：文本列表，包含文件路径和行范围
	 */
	private async callFastContext(_query: string): Promise<WayfinderResult> {
		throw new Error(
			"callFastContext requires MCP tool invocation - to be implemented by runtime",
		);

		// 预期实现示例（伪代码）：
		// const output = await mcpClient.call('fast-context___fast_context_search', {
		//   project_path: this.config.projectPath,
		//   query,
		//   max_results: 10,
		// });
		//
		// return this.parseFastContextOutput(query, output);
	}

	/**
	 * 调用 codebase-memory-mcp___search_graph
	 *
	 * 返回格式：JSON，结构化数据
	 */
	private async callCodebaseMemory(_query: string): Promise<WayfinderResult> {
		throw new Error(
			"callCodebaseMemory requires MCP tool invocation - to be implemented by runtime",
		);

		// 预期实现示例（伪代码）：
		// const projectName = this.normalizeProjectPath(this.config.projectPath);
		// const output = await mcpClient.call('codebase-memory-mcp___search_graph', {
		//   project: projectName,
		//   query,
		//   limit: 10,
		// });
		//
		// return this.parseCodebaseMemoryOutput(query, output);
	}

	/**
	 * 降级策略：使用 codebase-memory 作为最后的备选
	 */
	private async fallbackToCodebaseMemory(
		query: string,
		startTime: number,
	): Promise<WayfinderResult> {
		try {
			const result = await this.callCodebaseMemory(query);
			result.metadata.searchTimeMs = Date.now() - startTime;
			this.saveCache(query, result, "codebase-memory");
			return result;
		} catch (error) {
			// 所有工具都失败，返回空结果
			console.error(`All tools failed for query "${query}":`, error);
			return {
				query,
				tool: "codebase-memory",
				results: [],
				metadata: {
					totalResults: 0,
					searchTimeMs: Date.now() - startTime,
					cached: false,
					rawOutput: `Error: ${error instanceof Error ? error.message : String(error)}`,
				},
			};
		}
	}

	async clearExpiredCache(): Promise<number> {
		const result = this.db
			.prepare(
				`
      DELETE FROM wayfinder_cache
      WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
    `,
			)
			.run();
		return result.changes;
	}
}

/**
 * 工厂函数
 */
export function createWayfinderClient(
	db: SqliteDb,
	config: WayfinderConfig,
): WayfinderClient {
	return new DefaultWayfinderClient(db, config);
}
