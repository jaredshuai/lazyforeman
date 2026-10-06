import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	applySchema,
	openDatabase,
	type SqliteDb,
} from "../../src/db/connection.js";

const PHASE1_TABLES = [
	"missions",
	"features",
	"assertions",
	"handoffs",
	"progress_log",
	"step_journal",
];

function tableNames(db: SqliteDb): string[] {
	return (
		db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
			.all() as Array<{ name: string }>
	).map((row) => row.name);
}

describe("SQLite schema", () => {
	let db: SqliteDb;

	beforeEach(() => {
		db = openDatabase(":memory:");
	});

	afterEach(() => {
		db.close();
	});

	it("creates the 5 business tables plus step_journal", () => {
		const names = tableNames(db);
		for (const table of PHASE1_TABLES) {
			expect(names).toContain(table);
		}
	});

	it("is re-appliable so opening an existing database does not fail", () => {
		expect(() => applySchema(db)).not.toThrow();
	});

	it("enforces foreign keys between handoffs and features", () => {
		expect(() =>
			db
				.prepare(
					`INSERT INTO handoffs (id, feature_id, content, created_at) VALUES (?, ?, ?, ?)`,
				)
				.run(
					"handoff-orphan",
					"no-such-feature",
					"{}",
					new Date().toISOString(),
				),
		).toThrow(/FOREIGN KEY/i);
	});

	it("rejects statuses outside the CHECK constraint", () => {
		expect(() =>
			db
				.prepare(
					`INSERT INTO missions (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run("m-bad", "bad", null, "exploded", "2026-10-06", "2026-10-06"),
		).toThrow(/CHECK/i);
	});

	it("keeps one journal row per (workflow_id, step_name)", () => {
		const insert = db.prepare(
			`INSERT INTO step_journal (workflow_id, step_name, status) VALUES (?, ?, 'started')`,
		);
		insert.run("wf-1", "createWorktree");
		expect(() => insert.run("wf-1", "createWorktree")).toThrow(/UNIQUE/i);
	});
});
