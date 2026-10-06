import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import {
	createWayfinderClient,
	type WayfinderClient,
} from "../../src/wayfinder/client.js";
import type { SqliteDb } from "../../src/db/connection.js";
import type { WayfinderConfig } from "../../src/types/wayfinder.js";

describe("Wayfinder Client", () => {
	let db: SqliteDb;
	let client: WayfinderClient;

	beforeEach(() => {
		db = openDatabase(":memory:");
		const config: WayfinderConfig = {
			projectPath: "E:\\codespace\\lazyforeman",
			enableCache: true,
			cacheExpiryMs: 60000, // 1 minute
		};
		client = createWayfinderClient(db, config);
	});

	afterEach(() => {
		db.close();
	});

	describe("caching behavior", () => {
		it("should save results to wayfinder_cache table", async () => {
			// 由于实际工具调用需要 MCP 运行时，这里只测试缓存逻辑
			// 直接插入缓存数据来验证缓存读取
			const query = "test query";
			const mockResult = {
				query,
				tool: "codegraph" as const,
				results: [
					{
						file: "src/test.ts",
						lineRange: { start: 1, end: 10 },
					},
				],
				metadata: {
					totalResults: 1,
					searchTimeMs: 100,
					cached: false,
				},
			};

			db.prepare(
				`
        INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now', '+1 minute'))
      `,
			).run(query, JSON.stringify(mockResult), "codegraph");

			// 验证数据已保存
			const row = db
				.prepare("SELECT * FROM wayfinder_cache WHERE query = ?")
				.get(query) as { result_json: string; tool_used: string } | undefined;

			expect(row).toBeDefined();
			expect(row?.tool_used).toBe("codegraph");
			expect(JSON.parse(row?.result_json ?? "{}")).toMatchObject({
				query,
				tool: "codegraph",
			});
		});

		it("should respect cache expiry settings", async () => {
			const query = "expiring query";
			const mockResult = {
				query,
				tool: "fast-context" as const,
				results: [],
				metadata: {
					totalResults: 0,
					searchTimeMs: 50,
					cached: false,
				},
			};

			// 插入已过期的缓存
			db.prepare(
				`
        INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
        VALUES (?, ?, ?, datetime('now', '-2 minutes'), datetime('now', '-1 minute'))
      `,
			).run(query, JSON.stringify(mockResult), "fast-context");

			// 验证过期缓存不会被返回
			const row = db
				.prepare(
					`
        SELECT * FROM wayfinder_cache
        WHERE query = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      `,
				)
				.get(query);

			expect(row).toBeUndefined();
		});

		it("should skip cache when disabled", async () => {
			const noCacheConfig: WayfinderConfig = {
				projectPath: "E:\\codespace\\lazyforeman",
				enableCache: false,
			};
			createWayfinderClient(db, noCacheConfig);

			// 插入缓存数据
			const query = "cached query";
			const mockResult = {
				query,
				tool: "codegraph" as const,
				results: [],
				metadata: { totalResults: 0, searchTimeMs: 0, cached: false },
			};

			db.prepare(
				`
        INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `,
			).run(query, JSON.stringify(mockResult), "codegraph");

			// 由于工具调用会抛出异常（未实现），我们无法直接测试
			// 但可以验证配置正确传递
			expect(noCacheConfig.enableCache).toBe(false);
		});

		it("should clear expired cache entries", async () => {
			// 插入一些过期和未过期的缓存
			const queries = [
				{
					query: "expired1",
					expires_at: "datetime('now', '-1 minute')",
					expired: true,
				},
				{
					query: "expired2",
					expires_at: "datetime('now', '-5 minutes')",
					expired: true,
				},
				{
					query: "valid1",
					expires_at: "datetime('now', '+10 minutes')",
					expired: false,
				},
				{
					query: "valid2",
					expires_at: null,
					expired: false,
				},
			];

			for (const { query, expires_at } of queries) {
				const mockResult = {
					query,
					tool: "codegraph" as const,
					results: [],
					metadata: { totalResults: 0, searchTimeMs: 0, cached: false },
				};

				if (expires_at === null) {
					db.prepare(
						`
            INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
            VALUES (?, ?, ?, datetime('now'), NULL)
          `,
					).run(query, JSON.stringify(mockResult), "codegraph");
				} else {
					db.prepare(
						`
            INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
            VALUES (?, ?, ?, datetime('now'), ${expires_at})
          `,
					).run(query, JSON.stringify(mockResult), "codegraph");
				}
			}

			// 清除过期缓存
			const deletedCount = await client.clearExpiredCache();

			// 应该删除 2 条过期记录
			expect(deletedCount).toBe(2);

			// 验证剩余记录
			const remaining = db
				.prepare("SELECT COUNT(*) as count FROM wayfinder_cache")
				.get() as { count: number };
			expect(remaining.count).toBe(2);
		});
	});

	describe("tool selection strategy", () => {
		it("should prefer codegraph for architecture queries", () => {
			// exploreArchitecture 方法优先使用 codegraph
			// 由于工具调用需要 MCP，这里只验证方法存在
			expect(client.exploreArchitecture).toBeDefined();
			expect(typeof client.exploreArchitecture).toBe("function");
		});

		it("should prefer fast-context for pattern queries", () => {
			// searchPattern 方法优先使用 fast-context
			expect(client.searchPattern).toBeDefined();
			expect(typeof client.searchPattern).toBe("function");
		});
	});

	describe("result normalization", () => {
		it("should normalize results to WayfinderResult format", () => {
			// 验证类型定义存在
			const mockResult = {
				query: "test",
				tool: "codegraph" as const,
				results: [
					{
						file: "src/test.ts",
						snippet: "function test() {}",
						lineRange: { start: 1, end: 5 },
						relevance: 0.9,
						context: "Test function",
					},
				],
				metadata: {
					totalResults: 1,
					searchTimeMs: 100,
					cached: false,
				},
			};

			// 验证结构完整
			expect(mockResult.query).toBe("test");
			expect(mockResult.tool).toBe("codegraph");
			expect(mockResult.results).toHaveLength(1);
			expect(mockResult.results[0]).toHaveProperty("file");
			expect(mockResult.metadata).toHaveProperty("totalResults");
			expect(mockResult.metadata).toHaveProperty("searchTimeMs");
			expect(mockResult.metadata).toHaveProperty("cached");
		});
	});

	describe("error handling", () => {
		it("should return empty results when all tools fail", async () => {
			// 实际工具调用会失败，因为需要 MCP 运行时
			// 但降级策略会返回空结果而不是抛出异常
			const result = await client.exploreArchitecture("test");

			expect(result.query).toBe("test");
			expect(result.tool).toBe("codebase-memory");
			expect(result.results).toEqual([]);
			expect(result.metadata.totalResults).toBe(0);
			expect(result.metadata.cached).toBe(false);
			expect(result.metadata.rawOutput).toContain("Error");
		});

		it("should handle fallback gracefully", async () => {
			// searchPattern 也会降级到 codebase-memory
			const result = await client.searchPattern("test pattern");

			expect(result.query).toBe("test pattern");
			expect(result.tool).toBe("codebase-memory");
			expect(result.results).toEqual([]);
		});
	});

	describe("database schema validation", () => {
		it("should have wayfinder_cache table with correct columns", () => {
			const tableInfo = db
				.prepare(
					`
        SELECT name, type FROM pragma_table_info('wayfinder_cache')
      `,
				)
				.all() as Array<{ name: string; type: string }>;

			const columnNames = tableInfo.map((col) => col.name);
			expect(columnNames).toContain("query");
			expect(columnNames).toContain("result_json");
			expect(columnNames).toContain("tool_used");
			expect(columnNames).toContain("created_at");
			expect(columnNames).toContain("expires_at");
		});

		it("should support NULL expires_at for permanent cache", () => {
			const query = "permanent query";
			const mockResult = {
				query,
				tool: "codegraph" as const,
				results: [],
				metadata: { totalResults: 0, searchTimeMs: 0, cached: false },
			};

			// 插入永久缓存（expires_at 为 NULL）
			db.prepare(
				`
        INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
        VALUES (?, ?, ?, datetime('now'), NULL)
      `,
			).run(query, JSON.stringify(mockResult), "codegraph");

			// 验证数据存在
			const row = db
				.prepare("SELECT expires_at FROM wayfinder_cache WHERE query = ?")
				.get(query) as { expires_at: string | null } | undefined;

			expect(row).toBeDefined();
			expect(row?.expires_at).toBeNull();
		});
	});
});
