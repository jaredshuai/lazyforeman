import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { SqliteStepJournal } from "../runtime/step-journal.js";

/** better-sqlite3 的数据库实例类型 */
export type SqliteDb = Database.Database;

/** 默认状态库路径：`<cwd>/.lazyforeman/db.sqlite` */
export const DEFAULT_DB_PATH = path.join(".lazyforeman", "db.sqlite");

const SCHEMA_URL = new URL("./schema.sql", import.meta.url);

/**
 * 应用 Phase 1 schema。
 *
 * schema.sql 全部使用 `IF NOT EXISTS`，因此重复执行是安全的。
 *
 * @param db - 目标数据库句柄
 */
export function applySchema(db: SqliteDb): void {
	db.exec(fs.readFileSync(SCHEMA_URL, "utf8"));
}

/**
 * 打开（或创建）Lazyforeman 状态库，并保证 schema 已就位。
 *
 * @param filename - 数据库文件路径，`:memory:` 表示内存库
 * @returns 已应用 schema 且开启外键约束的数据库句柄
 */
export function openDatabase(filename: string = DEFAULT_DB_PATH): SqliteDb {
	if (filename !== ":memory:") {
		fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
	}

	const db = new Database(filename);
	db.pragma("foreign_keys = ON");
	applySchema(db);

	return db;
}

/** 运行一个 workflow 所需的最小持久化依赖 */
export interface RuntimeStores {
	db: SqliteDb;
	journal: SqliteStepJournal;
}

/**
 * 打开状态库并装配 Phase 1 运行时存储（业务表 + step journal）。
 *
 * @param filename - 数据库文件路径
 */
export function openRuntimeStores(
	filename: string = DEFAULT_DB_PATH,
): RuntimeStores {
	const db = openDatabase(filename);
	return { db, journal: new SqliteStepJournal(db) };
}
