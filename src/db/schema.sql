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
  FOREIGN KEY (feature_id) REFERENCES features (id)
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
