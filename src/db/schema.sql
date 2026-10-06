-- Lazyforeman Phase 1 存储层
-- 业务状态表（5 张）+ durable execution 日志表 step_journal（ADR-0001）
-- 本脚本必须可重复执行：所有语句均为 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  fulfills TEXT,
  preconditions TEXT,
  current_worker_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions (id)
);

CREATE TABLE IF NOT EXISTS assertions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed')),
  feature_id TEXT,
  evidence_path TEXT,
  validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  type TEXT CHECK (type IN ('deterministic', 'semantic')),
  claimed_by TEXT,
  mission_id TEXT,
  source_index INTEGER,
  created_from TEXT CHECK (created_from IN ('mission.md', 'manual')),
  FOREIGN KEY (feature_id) REFERENCES features (id),
  FOREIGN KEY (mission_id) REFERENCES missions (id)
);

-- content 存放序列化的完整 Handoff 对象，字段级查询留给 Phase 2 的断言账本
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features (id)
);

CREATE TABLE IF NOT EXISTS progress_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions (id)
);

CREATE TABLE IF NOT EXISTS step_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  input_json TEXT,
  output_json TEXT,
  error_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE (workflow_id, step_name)
);

CREATE INDEX IF NOT EXISTS idx_step_journal_workflow ON step_journal (workflow_id);

-- Phase 2.1 扩展：契约层支持

-- assertions 表索引（Phase 2.1）
CREATE INDEX IF NOT EXISTS idx_assertions_claimed_by ON assertions (claimed_by);
CREATE INDEX IF NOT EXISTS idx_assertions_mission_id ON assertions (mission_id);

-- 存储 mission.md 解析后的元数据
CREATE TABLE IF NOT EXISTS missions_metadata (
  mission_id TEXT PRIMARY KEY,
  background_json TEXT NOT NULL,
  goal TEXT NOT NULL,
  boundaries_json TEXT NOT NULL,
  success_criteria_json TEXT NOT NULL,
  architecture_constraints_json TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  raw_markdown TEXT NOT NULL,
  parsed_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions (id)
);

-- 缓存 Wayfinder 探索结果
CREATE TABLE IF NOT EXISTS wayfinder_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  result_json TEXT NOT NULL,
  tool_used TEXT NOT NULL CHECK (tool_used IN ('codegraph', 'fast-context', 'codebase-memory')),
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_wayfinder_query ON wayfinder_cache (query);
CREATE INDEX IF NOT EXISTS idx_wayfinder_expires ON wayfinder_cache (expires_at);

-- 记录断言覆盖率校验历史
CREATE TABLE IF NOT EXISTS coverage_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  validation_type TEXT NOT NULL CHECK (validation_type IN ('pre_work', 'post_feature')),
  total_assertions INTEGER NOT NULL,
  claimed_assertions INTEGER NOT NULL,
  orphan_assertions_json TEXT,
  duplicate_claims_json TEXT,
  passed BOOLEAN NOT NULL,
  validated_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions (id)
);

CREATE INDEX IF NOT EXISTS idx_coverage_mission ON coverage_validations (mission_id);
