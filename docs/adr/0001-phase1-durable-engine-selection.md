# ADR-0001: Phase 1 持久化引擎选型与 DBOS 适配性裁决

## 状态
**已批准** | 2026-10-06

## 背景

### 项目目标
Lazyforeman Phase 1 的唯一目标：证明「1 个 feature 端到端跑通 + 崩溃后 resume 不重复执行 step」。

### 原始技术栈决策（CONTEXT.md D3/D4/D5）
- **D3**：编排引擎使用 DBOS Transact（理由：成熟的 durable execution 语义，别自己造轮子）
- **D4**：存储使用 SQLite，预留 Postgres 升级路径（理由：单机零部署，本地可验证）
- **D5**：Worker 交互使用 omp -p 非交互模式

### 实测事实（2026-10-06）

| 检查项 | 结果 |
|--------|------|
| `@dbos-inc/dbos-sdk` 最新版 | 5.2.11（2026-09-29），官方描述 "built on **Postgres**" |
| 5.2.11 dependencies | `pg`（Postgres 客户端），**无任何 SQLite 依赖** |
| `grep -ri sqlite` dist/ | **0 命中** |
| SQLite system-database 适配器 | npm registry 搜索 41 个 dbos 相关包，全部为 Postgres datasource |
| 1.x 版本线 | 存在 1.20.22–1.30.13（2024-12），依赖 `knex + pg`，**不存在 1.0.0** |
| 本机 Postgres | 无 :5432 LISTEN、无 postgres.exe、无 psql |
| better-sqlite3 | 13.0.3 可安装且原生 binding 可用 |
| omp | **已安装** v18.4.10 |
| embedded-postgres | 存在 18.4.0-**beta** |

### 根本性冲突
**`@dbos-inc/dbos-sdk` + SQLite 这个组合在生态中不存在**。DBOS 的系统表（workflow 状态、step 日志）只能存储在 Postgres 中。

原始决策 D3（使用 DBOS）与 D4（使用 SQLite）**无法同时满足**。

## 候选方案

### 方案 A：自建 SQLite 持久层 + DBOS 作为可选升级路径

**实现**：
- 自建 `src/runtime/step-journal.ts`：SQLite 表记录 step 执行日志
- 自建 `src/runtime/workflow-runner.ts`：resume 时跳过已完成 step
- `@dbos-inc/dbos-sdk` 保留为依赖，但仅在提供 Postgres URL 时激活
- 5 张业务表（missions/features/assertions/handoffs/progress_log）仍用 SQLite

**收益**：
- ✅ Phase 1 两个目标 100% 本地可验证
- ✅ `pnpm run test` 可真正跑绿，无需外部服务
- ✅ 符合 D4「单机零部署」初衷
- ✅ 开发/CI 环境零摩擦

**代价**：
- ❌ 重复实现 DBOS 的一小块 durable execution 语义
- ❌ 与 D3 选型理由（"别自己造轮子"）正面冲突
- ⚠️ 需要明确自建层的**封顶条款**，防止变成第二个 DBOS

### 方案 B：真 DBOS + embedded-postgres + 双存储

**实现**：
- 使用 `@dbos-inc/dbos-sdk` + `@embedded-postgres/windows-x64`
- DBOS 系统表（workflow/step 状态）→ embedded Postgres
- 5 张业务表 → 仍用 SQLite

**收益**：
- ✅ D3 字面满足，崩溃恢复用真 DBOS 语义
- ✅ App 状态仍在 SQLite（D4 部分满足）

**代价**：
- ❌ 引入 **beta** 版本依赖 + Postgres 二进制（~50MB 下载）
- ❌ 测试需拉起 DB 进程，门禁变慢（+5–10s 启动时间）
- ❌ 离线环境不可复现
- ❌ 违背 D4「单机零部署」初衷

### 方案 C：真 DBOS + 外部 Postgres（人工提供）

**实现**：
- 使用 `@dbos-inc/dbos-sdk`，要求用户提供 Postgres 实例

**代价**：
- ❌ 本机无法验证（违背工程纪律「诚实报告门禁」）
- ❌ `pnpm run test` 无法证明通过
- ❌ 崩溃恢复只能报告「未接线」（符合纪律但不理想）
- ❌ 新贡献者环境配置成本高

## 决策

**选择方案 A**：自建 SQLite 持久层，DBOS 作为可选升级路径。

### 理由

1. **Phase 1 的目标是「证明可恢复」，而非「证明会用 DBOS」**
   - 端到端崩溃恢复的**语义正确性**比使用特定框架更重要
   - 自建层只需实现「step 日志 + 幂等跳过」的最小语义

2. **工程纪律要求「本地可验证」优先于「技术栈完美」**
   - 测试必须在 `pnpm run test` 中跑绿
   - 门禁不应依赖外部服务或二进制下载

3. **D3 的本质是「成熟的 durable execution 语义」，而非特定实现**
   - 自建层**参考** DBOS 的语义设计（workflow ID、step 幂等、序列化）
   - 保留 `@dbos-inc/dbos-sdk` 依赖作为**升级路径**，而非立即切换

4. **代价可控**
   - Phase 1 只需 2 个 workflow（single-feature + milestone-validation）
   - 自建层封顶在 ~200 行代码，复杂度远低于完整 DBOS

## 实施细节

### 自建层范围（封顶条款）

```typescript
// src/runtime/step-journal.ts
export interface StepJournal {
  // 核心能力（Phase 1 必须）
  recordStepStart(workflowId: string, stepName: string, input: unknown): Promise<void>;
  recordStepSuccess(workflowId: string, stepName: string, output: unknown): Promise<void>;
  recordStepFailure(workflowId: string, stepName: string, error: unknown): Promise<void>;
  getCompletedSteps(workflowId: string): Promise<Map<string, unknown>>;
  
  // Phase 1 不实现（留给 DBOS）
  // ❌ 分布式锁
  // ❌ 跨进程通信
  // ❌ Saga 补偿
  // ❌ 子 workflow 嵌套
}
```

### SQLite 表结构

```sql
-- src/db/schema.sql（追加）
CREATE TABLE IF NOT EXISTS step_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started', 'success', 'failed')),
  input_json TEXT,
  output_json TEXT,
  error_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(workflow_id, step_name)
);

CREATE INDEX idx_step_journal_workflow ON step_journal(workflow_id);
```

### Workflow ID 生成规则

```typescript
// src/runtime/workflow-id.ts
export function generateWorkflowId(
  type: 'single-feature' | 'milestone', 
  entityId: string
): string {
  // 格式: <type>:<entityId>:<timestamp>
  // 例如: single-feature:feat-001:2026-10-06T10:30:00.000Z
  return `${type}:${entityId}:${new Date().toISOString()}`;
}

// Resume 时使用相同的 workflowId（从 progress_log 或参数传入）
```

### 失败 step 重放规则

- `status='success'` → 直接返回 `output_json`，不重新执行
- `status='failed'` → **重新执行**（可能是瞬态错误）
- `status='started'` 但无 `completed_at` → 视为崩溃，**重新执行**

### 依赖处理

**保留 `@dbos-inc/dbos-sdk`，标记为 optionalDependencies**：

```json
{
  "dependencies": {
    "better-sqlite3": "^13.0.3",
    "zod": "^4.6.5"
  },
  "optionalDependencies": {
    "@dbos-inc/dbos-sdk": "^5.2.11"
  }
}
```

**代码适配**：

```typescript
// src/runtime/engine-factory.ts
export function createExecutionEngine(config: EngineConfig): ExecutionEngine {
  if (config.postgresUrl) {
    try {
      const DBOS = require('@dbos-inc/dbos-sdk');
      return new DbosEngine(DBOS, config.postgresUrl);
    } catch (e) {
      throw new Error('DBOS SDK not installed. Run: pnpm add @dbos-inc/dbos-sdk');
    }
  }
  
  // 默认使用自建 SQLite 引擎
  return new SqliteEngine(config.sqlitePath);
}
```

## 后果

### 正面

1. ✅ **Phase 1 可交付**：`pnpm run test` 全绿，本地可验证崩溃恢复
2. ✅ **零外部依赖**：开发/CI 环境零摩擦
3. ✅ **代码量可控**：自建层 ~200 行，远低于完整 DBOS
4. ✅ **升级路径清晰**：保留 DBOS 依赖，提供 Postgres URL 即可切换

### 负面

1. ❌ **与 D3 原始理由冲突**：「别自己造轮子」被推翻
2. ⚠️ **维护负担**：需要自己保证 step 幂等性的正确性
3. ⚠️ **迁移成本**：Phase 2+ 切换到 DBOS 时需要数据迁移工具

### 缓解措施

1. **严格封顶**：自建层只实现 step 日志，不扩展到分布式/Saga/子 workflow
2. **参考 DBOS 设计**：workflow ID、序列化格式、错误处理参考 DBOS 文档
3. **预留迁移接口**：`ExecutionEngine` 接口抽象，DBOS 实现预留为 `DbosEngine`

## 升级路径（Phase 2+）

### 切换到 DBOS 的条件

满足以下**任一**条件时，应考虑切换：

1. **分布式需求**：需要跨机器协调 workflow
2. **复杂编排**：需要 Saga 补偿或子 workflow 嵌套
3. **运维成熟度**：团队已有 Postgres 运维能力
4. **规模扩展**：单机 SQLite 性能瓶颈（预计 >10k features/day）

### 迁移步骤

```typescript
// 1. 安装 DBOS（已在 optionalDependencies）
// 2. 提供 Postgres URL
const engine = createExecutionEngine({
  postgresUrl: process.env.DATABASE_URL,
  // sqlitePath 被忽略
});

// 3. 数据迁移工具（Phase 2 实现）
// scripts/migrate-to-dbos.ts
// - 读取 SQLite step_journal
// - 写入 DBOS system tables
// - 验证 workflow 可 resume
```

## 附录：封顶条款（防止功能蔓延）

自建 `step-journal` 模块**严禁**实现以下能力（Phase 1）：

| 能力 | 说明 | 替代方案 |
|------|------|----------|
| 分布式锁 | 跨进程/机器的 workflow 互斥 | Phase 1 单机单进程，不需要 |
| Saga 补偿 | 失败后自动回滚已完成 step | Phase 1 依赖 git worktree cleanup |
| 子 workflow | workflow 嵌套调用 | Phase 1 仅 2 个平级 workflow |
| Event sourcing | 基于事件重建状态 | Phase 1 直接存 step output |
| 可观测性 | Tracing/metrics 集成 | Phase 1 仅 console.log |
| 并发控制 | 同一 workflow 并发 step | Phase 1 顺序执行 |

若 Phase 2+ 需要以上能力，**必须切换到 DBOS**，不得继续扩展自建层。

## 相关决策

- **CONTEXT.md D3** 已修订（见下）
- **CONTEXT.md D4** 保持不变（SQLite 作为主存储）
- **Phase 1 实现指南** 需要重写
