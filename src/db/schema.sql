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
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'infeasible')),
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
  notes TEXT,
  FOREIGN KEY (feature_id) REFERENCES features (id),
  FOREIGN KEY (mission_id) REFERENCES missions (id)
);

-- content 存放序列化的完整 Handoff 对象，字段级查询留给 Phase 2 的断言账本
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  discovered_issues_json TEXT,
  FOREIGN KEY (feature_id) REFERENCES features (id)
);

-- Phase 2.2 扩展：discovered_issues 专用表（用于查询和分析）
CREATE TABLE IF NOT EXISTS discovered_issues (
  id TEXT PRIMARY KEY,
  handoff_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('blocking', 'warning', 'info')),
  category TEXT NOT NULL CHECK (category IN (
    'dependency_missing',
    'architecture_conflict',
    'assertion_infeasible',
    'scope_ambiguity',
    'technical_constraint',
    'other'
  )),
  description TEXT NOT NULL,
  context TEXT NOT NULL,
  suggested_fix TEXT,
  affected_assertions_json TEXT,
  discovered_at TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TEXT,
  FOREIGN KEY (handoff_id) REFERENCES handoffs(id),
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX IF NOT EXISTS idx_discovered_issues_severity 
  ON discovered_issues(severity);
CREATE INDEX IF NOT EXISTS idx_discovered_issues_feature 
  ON discovered_issues(feature_id);
CREATE INDEX IF NOT EXISTS idx_discovered_issues_handoff
  ON discovered_issues(handoff_id);
CREATE INDEX IF NOT EXISTS idx_discovered_issues_resolved
  ON discovered_issues(resolved);

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

-- Phase 2.2 扩展：Grill Agent 支持

-- 存储 Grill-with-docs 会话历史
CREATE TABLE IF NOT EXISTS grill_sessions (
  id TEXT PRIMARY KEY,
  rough_goal TEXT NOT NULL,
  generated_mission TEXT,
  messages_json TEXT NOT NULL,  -- JSON array of GrillMessage
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_grill_status ON grill_sessions (status);
CREATE INDEX IF NOT EXISTS idx_grill_created ON grill_sessions (created_at);

-- Phase 2.2 扩展：Signal 机制（feat-009）

-- 存储 Orchestrator 发送的 signals（需要人工裁决）
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_json TEXT,
  CONSTRAINT check_status CHECK (status IN ('pending', 'resolved', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);
