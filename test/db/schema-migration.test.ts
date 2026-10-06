import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase } from "../../src/db/connection.js";
import type { SqliteDb } from "../../src/db/connection.js";

/**
 * Phase 2.1 Schema Migration Tests
 *
 * 验证 schema 扩展的向后兼容性、索引创建、约束检查等。
 */

describe("Schema Migration (Phase 2.1)", () => {
	let db: SqliteDb;

	beforeEach(() => {
		db = openDatabase(":memory:");
	});

	afterEach(() => {
		db.close();
	});

	it("creates all Phase 2.1 tables", () => {
		// 验证 missions_metadata 表存在
		const metadataTable = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='missions_metadata'",
			)
			.get() as { name: string } | undefined;
		expect(metadataTable).toBeDefined();
		expect(metadataTable?.name).toBe("missions_metadata");

		// 验证 wayfinder_cache 表存在
		const wayfinderTable = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='wayfinder_cache'",
			)
			.get() as { name: string } | undefined;
		expect(wayfinderTable).toBeDefined();
		expect(wayfinderTable?.name).toBe("wayfinder_cache");

		// 验证 coverage_validations 表存在
		const coverageTable = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='coverage_validations'",
			)
			.get() as { name: string } | undefined;
		expect(coverageTable).toBeDefined();
		expect(coverageTable?.name).toBe("coverage_validations");
	});

	it("adds Phase 2.1 columns to assertions table", () => {
		// 查询 assertions 表的所有列
		const columns = db.prepare("PRAGMA table_info(assertions)").all() as Array<{
			name: string;
			type: string;
		}>;

		const columnNames = columns.map((col) => col.name);

		// 验证 Phase 1 列仍然存在（向后兼容）
		expect(columnNames).toContain("id");
		expect(columnNames).toContain("description");
		expect(columnNames).toContain("status");
		expect(columnNames).toContain("feature_id");

		// 验证 Phase 2.1 新增列
		expect(columnNames).toContain("type");
		expect(columnNames).toContain("claimed_by");
		expect(columnNames).toContain("mission_id");
		expect(columnNames).toContain("source_index");
		expect(columnNames).toContain("created_from");
	});

	it("creates indexes on new columns", () => {
		// 查询所有索引
		const indexes = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='assertions'",
			)
			.all() as Array<{ name: string }>;

		const indexNames = indexes.map((idx) => idx.name);

		// 验证 Phase 2.1 索引
		expect(indexNames).toContain("idx_assertions_claimed_by");
		expect(indexNames).toContain("idx_assertions_mission_id");
	});

	it("validates CHECK constraints on new columns", () => {
		// 插入一条测试 mission
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run("M1", "Test Mission", "pending", "2024-01-01", "2024-01-01");

		// 测试 type 约束：只允许 'deterministic' 或 'semantic'
		const validAssertion = db.prepare(
			`INSERT INTO assertions (id, description, status, created_at, updated_at, type, mission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		);

		// 有效值应该成功
		validAssertion.run(
			"VAL-1",
			"Test",
			"pending",
			"2024-01-01",
			"2024-01-01",
			"deterministic",
			"M1",
		);
		validAssertion.run(
			"VAL-2",
			"Test",
			"pending",
			"2024-01-01",
			"2024-01-01",
			"semantic",
			"M1",
		);

		// 无效值应该失败
		expect(() => {
			validAssertion.run(
				"VAL-3",
				"Test",
				"pending",
				"2024-01-01",
				"2024-01-01",
				"invalid",
				"M1",
			);
		}).toThrow();

		// 测试 created_from 约束
		const createdFromAssertion = db.prepare(
			`INSERT INTO assertions (id, description, status, created_at, updated_at, created_from)
       VALUES (?, ?, ?, ?, ?, ?)`,
		);

		// 有效值
		createdFromAssertion.run(
			"VAL-4",
			"Test",
			"pending",
			"2024-01-01",
			"2024-01-01",
			"mission.md",
		);
		createdFromAssertion.run(
			"VAL-5",
			"Test",
			"pending",
			"2024-01-01",
			"2024-01-01",
			"manual",
		);

		// 无效值
		expect(() => {
			createdFromAssertion.run(
				"VAL-6",
				"Test",
				"pending",
				"2024-01-01",
				"2024-01-01",
				"unknown",
			);
		}).toThrow();
	});

	it("enforces foreign key constraints", () => {
		// 测试 missions_metadata 外键约束
		expect(() => {
			db.prepare(
				`INSERT INTO missions_metadata 
           (mission_id, background_json, goal, boundaries_json, success_criteria_json, 
            architecture_constraints_json, risks_json, raw_markdown, parsed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				"NONEXISTENT",
				"[]",
				"test",
				"{}",
				"[]",
				"[]",
				"[]",
				"test",
				"2024-01-01",
			);
		}).toThrow();

		// 创建一个 mission，然后插入 metadata 应该成功
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run("M1", "Test", "pending", "2024-01-01", "2024-01-01");

		db.prepare(
			`INSERT INTO missions_metadata 
       (mission_id, background_json, goal, boundaries_json, success_criteria_json, 
        architecture_constraints_json, risks_json, raw_markdown, parsed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("M1", "[]", "test", "{}", "[]", "[]", "[]", "test", "2024-01-01");

		// 验证插入成功
		const metadata = db
			.prepare("SELECT * FROM missions_metadata WHERE mission_id = ?")
			.get("M1") as { mission_id: string } | undefined;
		expect(metadata).toBeDefined();
		expect(metadata?.mission_id).toBe("M1");
	});

	it("supports wayfinder cache operations", () => {
		// 插入缓存记录
		const stmt = db.prepare(
			`INSERT INTO wayfinder_cache (query, result_json, tool_used, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
		);

		stmt.run(
			"test query",
			'{"result": "data"}',
			"codegraph",
			"2024-01-01T00:00:00Z",
			"2024-01-02T00:00:00Z",
		);

		// 查询缓存
		const cached = db
			.prepare("SELECT * FROM wayfinder_cache WHERE query = ?")
			.get("test query") as
			| { query: string; result_json: string; tool_used: string }
			| undefined;

		expect(cached).toBeDefined();
		expect(cached?.query).toBe("test query");
		expect(cached?.tool_used).toBe("codegraph");

		// 测试 tool_used 约束
		expect(() => {
			stmt.run("query2", "{}", "invalid-tool", "2024-01-01T00:00:00Z", null);
		}).toThrow();
	});

	it("supports coverage validation tracking", () => {
		// 创建一个 mission
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run("M1", "Test", "pending", "2024-01-01", "2024-01-01");

		// 插入覆盖率校验记录
		const stmt = db.prepare(
			`INSERT INTO coverage_validations 
       (mission_id, validation_type, total_assertions, claimed_assertions, 
        orphan_assertions_json, duplicate_claims_json, passed, validated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		);

		stmt.run(
			"M1",
			"pre_work",
			10,
			8,
			'["VAL-1", "VAL-2"]',
			'{"VAL-3": ["F1", "F2"]}',
			0,
			"2024-01-01T00:00:00Z",
		);

		// 查询记录
		const validation = db
			.prepare("SELECT * FROM coverage_validations WHERE mission_id = ?")
			.get("M1") as
			| {
					mission_id: string;
					validation_type: string;
					total_assertions: number;
					claimed_assertions: number;
					passed: number;
			  }
			| undefined;

		expect(validation).toBeDefined();
		expect(validation?.mission_id).toBe("M1");
		expect(validation?.validation_type).toBe("pre_work");
		expect(validation?.total_assertions).toBe(10);
		expect(validation?.claimed_assertions).toBe(8);
		expect(validation?.passed).toBe(0); // SQLite stores false as 0

		// 测试 validation_type 约束
		expect(() => {
			stmt.run(
				"M1",
				"invalid_type",
				5,
				5,
				null,
				null,
				1,
				"2024-01-01T00:00:00Z",
			);
		}).toThrow();
	});

	it("maintains backward compatibility with Phase 1", () => {
		// Phase 1 的插入操作应该仍然有效（不需要提供 Phase 2.1 字段）
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run("M1", "Test", "pending", "2024-01-01", "2024-01-01");

		db.prepare(
			`INSERT INTO features (id, mission_id, name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run("F1", "M1", "Feature 1", "pending", "2024-01-01", "2024-01-01");

		db.prepare(
			`INSERT INTO assertions (id, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
		).run("VAL-1", "Test assertion", "pending", "2024-01-01", "2024-01-01");

		// 验证插入成功
		const assertion = db
			.prepare("SELECT * FROM assertions WHERE id = ?")
			.get("VAL-1") as
			| {
					id: string;
					description: string;
					type: string | null;
					claimed_by: string | null;
			  }
			| undefined;

		expect(assertion).toBeDefined();
		expect(assertion?.id).toBe("VAL-1");
		expect(assertion?.description).toBe("Test assertion");

		// Phase 2.1 字段应该为 NULL
		expect(assertion?.type).toBeNull();
		expect(assertion?.claimed_by).toBeNull();
	});
});
