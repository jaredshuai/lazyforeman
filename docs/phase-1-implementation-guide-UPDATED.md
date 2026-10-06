# Phase 1 实现指南（基于 ADR-0001 更新版）

> **重要**：本文档基于 `docs/adr/0001-phase1-durable-engine-selection.md` 裁决更新。
> 原指南假设使用 DBOS + SQLite，但实测发现 `@dbos-inc/dbos-sdk` 5.x 只支持 Postgres。
> Phase 1 采用**自建 SQLite 持久层**，DBOS 作为可选升级路径。

---

## 目标

证明「1 个 feature 端到端跑通 + 崩溃后 resume 不重复执行 step」。

**验收标准**：
```bash
pnpm run test   # 所有测试通过
pnpm run type   # 类型检查通过
pnpm run lint   # Lint 通过
pnpm run format # 格式检查通过
```

---

## 技术栈（已确定）

- **语言**：TypeScript 6.0.3（ESM 模块，strict mode）
- **包管理器**：pnpm 10.33.2
- **持久层**：better-sqlite3 13.0.3
- **Schema 验证**：zod 4.6.5
- **测试框架**：vitest 5.0.0
- **Worker CLI**：omp 18.4.10（已安装）
- **可选编排引擎**：@dbos-inc/dbos-sdk 5.2.11（optionalDependencies）

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Workflow Runner                         │
│  (src/runtime/workflow-runner.ts)                          │
│                                                             │
│  runWorkflow(ctx) {                                        │
│    const worktreePath = await runStep(ctx, 'createWorktree', │
│      () => createWorktree(featureId));                      │
│    const handoff = await runStep(ctx, 'runOmp',            │
│      () => runOmp(worktreePath, spec));                    │
│    await runStep(ctx, 'saveHandoff',                       │
│      () => saveHandoff(db, handoff));                      │
│    await runStep(ctx, 'cleanup',                           │
│      () => cleanupWorktree(worktreePath, false));          │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Step Journal                            │
│  (src/runtime/step-journal.ts)                             │
│                                                             │
│  SQLite Table: step_journal                                │
│  - workflow_id, step_name, status                          │
│  - input_json, output_json, error_json                     │
│  - started_at, completed_at                                │
│                                                             │
│  getCompletedSteps(workflowId) → Map<stepName, output>    │
└─────────────────────────────────────────────────────────────┘
```

---

## 任务清单

### 任务 1：SQLite Schema 扩展

**文件**：`src/db/schema.sql`

**新增表**：

```sql
-- Step journal for crash recovery
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

**已有表**（保持不变）：
- missions
- features
- assertions
- handoffs
- progress_log

---

### 任务 2：Step Journal 实现

**文件**：`src/runtime/step-journal.ts`

**接口定义**：

```typescript
export interface StepJournal {
  recordStepStart(workflowId: string, stepName: string, input: unknown): Promise<void>;
  recordStepSuccess(workflowId: string, stepName: string, output: unknown): Promise<void>;
  recordStepFailure(workflowId: string, stepName: string, error: unknown): Promise<void>;
  getCompletedSteps(workflowId: string): Promise<Map<string, unknown>>;
}

export class SqliteStepJournal implements StepJournal {
  constructor(private db: Database) {}
  
  async recordStepStart(workflowId: string, stepName: string, input: unknown): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO step_journal (workflow_id, step_name, status, input_json)
      VALUES (?, ?, 'started', ?)
      ON CONFLICT(workflow_id, step_name) DO UPDATE SET
        status = 'started',
        started_at = datetime('now'),
        completed_at = NULL
    `);
    stmt.run(workflowId, stepName, JSON.stringify(input));
  }
  
  async recordStepSuccess(workflowId: string, stepName: string, output: unknown): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE step_journal
      SET status = 'success',
          output_json = ?,
          completed_at = datetime('now')
      WHERE workflow_id = ? AND step_name = ?
    `);
    stmt.run(JSON.stringify(output), workflowId, stepName);
  }
  
  async recordStepFailure(workflowId: string, stepName: string, error: unknown): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE step_journal
      SET status = 'failed',
          error_json = ?,
          completed_at = datetime('now')
      WHERE workflow_id = ? AND step_name = ?
    `);
    const errorJson = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error;
    stmt.run(JSON.stringify(errorJson), workflowId, stepName);
  }
  
  async getCompletedSteps(workflowId: string): Promise<Map<string, unknown>> {
    const stmt = this.db.prepare(`
      SELECT step_name, output_json
      FROM step_journal
      WHERE workflow_id = ? AND status = 'success'
    `);
    const rows = stmt.all(workflowId) as Array<{ step_name: string; output_json: string }>;
    
    const map = new Map<string, unknown>();
    for (const row of rows) {
      map.set(row.step_name, JSON.parse(row.output_json));
    }
    return map;
  }
}
```

**封顶条款**：
- ❌ 不实现分布式锁
- ❌ 不实现 Saga 补偿
- ❌ 不实现子 workflow
- ❌ 不实现 Event sourcing

---

### 任务 3：Workflow Runner 实现

**文件**：`src/runtime/workflow-runner.ts`

**核心函数**：

```typescript
import type { StepJournal } from './step-journal.js';

export interface WorkflowContext {
  workflowId: string;
  journal: StepJournal;
  
  // 故障注入 hook（仅测试使用）
  _testHooks?: {
    beforeStep?: (stepName: string) => void | Promise<void>;
    afterStep?: (stepName: string) => void | Promise<void>;
  };
}

export async function runStep<T>(
  ctx: WorkflowContext,
  stepName: string,
  fn: () => Promise<T>
): Promise<T> {
  // 1. 检查是否已完成（幂等性）
  const completed = await ctx.journal.getCompletedSteps(ctx.workflowId);
  if (completed.has(stepName)) {
    console.log(`⏩ Step '${stepName}' already completed, skipping`);
    return completed.get(stepName) as T;
  }
  
  // 2. 故障注入点 1（测试用）
  await ctx._testHooks?.beforeStep?.(stepName);
  
  // 3. 记录开始
  await ctx.journal.recordStepStart(ctx.workflowId, stepName, undefined);
  console.log(`▶️  Step '${stepName}' started`);
  
  try {
    // 4. 执行 step
    const result = await fn();
    
    // 5. 记录成功
    await ctx.journal.recordStepSuccess(ctx.workflowId, stepName, result);
    console.log(`✅ Step '${stepName}' completed`);
    
    // 6. 故障注入点 2（测试用）
    await ctx._testHooks?.afterStep?.(stepName);
    
    return result;
  } catch (error) {
    // 7. 记录失败
    await ctx.journal.recordStepFailure(ctx.workflowId, stepName, error);
    console.error(`❌ Step '${stepName}' failed:`, error);
    throw error;
  }
}

export function generateWorkflowId(
  type: 'single-feature' | 'milestone',
  entityId: string
): string {
  return `${type}:${entityId}:${new Date().toISOString()}`;
}
```

---

### 任务 4：Worktree 管理器

**文件**：`src/worktree/manager.ts`

**配置**：

```typescript
import path from 'node:path';

export const WORKTREE_ROOT = process.env.LAZYFOREMAN_WORKTREE_ROOT 
  ?? path.join(process.cwd(), '.lazyforeman', 'worktrees');
  // 默认：项目根目录/.lazyforeman/worktrees/
  // 避免跨盘符（Windows git worktree 代价高）
  // 避免 os.tmpdir()（每用户不同、重启丢失）
```

**核心函数**：

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const execAsync = promisify(exec);

export async function createWorktree(featureId: string): Promise<string> {
  const branchName = `feature/${featureId}`;
  const worktreePath = path.join(WORKTREE_ROOT, featureId);
  
  // 确保 worktree 根目录存在
  await fs.mkdir(WORKTREE_ROOT, { recursive: true });
  
  // 创建 worktree
  await execAsync(`git worktree add ${worktreePath} -b ${branchName}`);
  
  console.log(`📁 Worktree created: ${worktreePath}`);
  return worktreePath;
}

export async function cleanupWorktree(
  worktreePath: string,
  keepOnFailure: boolean
): Promise<void> {
  if (keepOnFailure) {
    console.warn(`⚠️  Worktree preserved for debugging: ${worktreePath}`);
    console.warn(`   Clean up manually: git worktree remove ${worktreePath}`);
    return;
  }
  
  await execAsync(`git worktree remove --force ${worktreePath}`);
  await fs.rm(worktreePath, { recursive: true, force: true });
  console.log(`🗑️  Worktree cleaned up: ${worktreePath}`);
}
```

---

### 任务 5：Omp Runner

**文件**：`src/omp/runner.ts`

**Handoff Schema**（zod 4.x）：

```typescript
import { z } from 'zod';

export const HandoffSchema = z.object({
  id: z.string().min(1),
  featureId: z.string().min(1),
  salientSummary: z.string().min(1),
  whatWasImplemented: z.array(z.string()).min(1),
  whatWasLeftUndone: z.array(z.string()),
  verification: z.object({
    commandsRun: z.array(z.object({
      command: z.string(),
      exitCode: z.number(),
      observation: z.string()
    })),
    interactiveChecks: z.array(z.object({
      action: z.string(),
      observed: z.string()
    }))
  }),
  tests: z.object({
    added: z.array(z.object({
      file: z.string(),
      cases: z.array(z.object({
        name: z.string(),
        verifies: z.string()  // VAL-* ID
      }))
    })),
    coverage: z.string()
  }),
  discoveredIssues: z.array(z.object({
    severity: z.enum(['blocking', 'non_blocking', 'suggestion']),
    description: z.string(),
    suggestedFix: z.string()
  })),
  skillFeedback: z.object({
    followedProcedure: z.boolean(),
    deviations: z.array(z.object({
      step: z.string(),
      whatIDidInstead: z.string(),
      why: z.string()
    })),
    suggestedChanges: z.array(z.string())
  }),
  createdAt: z.string()
});

export type Handoff = z.infer<typeof HandoffSchema>;
```

**Runner 实现**：

```typescript
export async function runOmp(
  worktreePath: string,
  spec: string
): Promise<Handoff> {
  const prompt = `Implement the following feature:

${spec}

Output a JSON handoff conforming to the Handoff schema.`;

  // 调用 omp -p（非交互模式）
  const { stdout } = await execAsync(
    `omp -p --output-format json`,
    {
      cwd: worktreePath,
      env: {
        ...process.env,
        OMP_PROMPT: prompt
      }
    }
  );
  
  // 解析并验证 JSON
  const raw = JSON.parse(stdout);
  const handoff = HandoffSchema.parse(raw);
  
  return handoff;
}
```

---

### 任务 6：Single Feature Workflow

**文件**：`src/workflows/single-feature.ts`

**完整流程**：

```typescript
import type { Database } from 'better-sqlite3';
import type { WorkflowContext } from '../runtime/workflow-runner.js';
import { runStep } from '../runtime/workflow-runner.js';
import { createWorktree, cleanupWorktree } from '../worktree/manager.js';
import { runOmp } from '../omp/runner.js';

export async function singleFeatureWorkflow(
  ctx: WorkflowContext,
  db: Database,
  featureId: string,
  spec: string
): Promise<{ success: boolean; handoffId?: string }> {
  let worktreePath: string | undefined;
  
  try {
    // Step 1: Create worktree
    worktreePath = await runStep(
      ctx,
      'createWorktree',
      () => createWorktree(featureId)
    );
    
    // Step 2: Run omp
    const handoff = await runStep(
      ctx,
      'runOmp',
      () => runOmp(worktreePath!, spec)
    );
    
    // Step 3: Save handoff
    const handoffId = await runStep(
      ctx,
      'saveHandoff',
      async () => {
        const stmt = db.prepare(`
          INSERT INTO handoffs (
            id, feature_id, salient_summary, what_was_implemented,
            what_was_left_undone, verification, tests, discovered_issues,
            skill_feedback, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          handoff.id,
          handoff.featureId,
          handoff.salientSummary,
          JSON.stringify(handoff.whatWasImplemented),
          JSON.stringify(handoff.whatWasLeftUndone),
          JSON.stringify(handoff.verification),
          JSON.stringify(handoff.tests),
          JSON.stringify(handoff.discoveredIssues),
          JSON.stringify(handoff.skillFeedback),
          handoff.createdAt
        );
        return handoff.id;
      }
    );
    
    // Step 4: Cleanup worktree
    await runStep(
      ctx,
      'cleanup',
      () => cleanupWorktree(worktreePath!, false)
    );
    
    return { success: true, handoffId };
    
  } catch (error) {
    console.error('Workflow failed:', error);
    
    // 失败时保留 worktree 用于调试
    if (worktreePath) {
      await cleanupWorktree(worktreePath, true);
    }
    
    throw error;
  }
}
```

---

### 任务 7：崩溃恢复测试

**文件**：`test/workflows/recovery.test.ts`

**测试场景**：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteStepJournal } from '../../src/runtime/step-journal.js';
import { singleFeatureWorkflow } from '../../src/workflows/single-feature.js';
import { generateWorkflowId } from '../../src/runtime/workflow-runner.js';

describe('crash recovery', () => {
  let db: Database;
  let journal: SqliteStepJournal;
  
  beforeEach(() => {
    db = new Database(':memory:');
    // 创建 schema
    journal = new SqliteStepJournal(db);
  });
  
  afterEach(() => {
    db.close();
  });
  
  it('should resume after crash between steps', async () => {
    const workflowId = generateWorkflowId('single-feature', 'feat-001');
    let crashInjected = false;
    
    const ctx = {
      workflowId,
      journal,
      _testHooks: {
        afterStep: async (stepName: string) => {
          if (stepName === 'createWorktree' && !crashInjected) {
            crashInjected = true;
            throw new Error('SIMULATED_CRASH');
          }
        }
      }
    };
    
    // 第一次运行：在 createWorktree 后崩溃
    await expect(
      singleFeatureWorkflow(ctx, db, 'feat-001', 'test spec')
    ).rejects.toThrow('SIMULATED_CRASH');
    
    // 验证 step 已记录
    const completed = await journal.getCompletedSteps(workflowId);
    expect(completed.has('createWorktree')).toBe(true);
    
    // 第二次运行：resume（不重复执行 createWorktree）
    delete ctx._testHooks;  // 移除故障注入
    const result = await singleFeatureWorkflow(ctx, db, 'feat-001', 'test spec');
    
    expect(result.success).toBe(true);
    // TODO: 验证 createWorktree 没有被重复执行（通过 spy 计数）
  });
  
  it('should retry failed steps', async () => {
    const workflowId = generateWorkflowId('single-feature', 'feat-002');
    let failCount = 0;
    
    const ctx = {
      workflowId,
      journal,
      _testHooks: {
        beforeStep: async (stepName: string) => {
          if (stepName === 'runOmp' && failCount < 2) {
            failCount++;
            throw new Error('TRANSIENT_ERROR');
          }
        }
      }
    };
    
    // 第一次运行：runOmp 失败
    await expect(
      singleFeatureWorkflow(ctx, db, 'feat-002', 'test spec')
    ).rejects.toThrow('TRANSIENT_ERROR');
    
    // 第二次运行：runOmp 再次失败
    await expect(
      singleFeatureWorkflow(ctx, db, 'feat-002', 'test spec')
    ).rejects.toThrow('TRANSIENT_ERROR');
    
    // 第三次运行：成功
    const result = await singleFeatureWorkflow(ctx, db, 'feat-002', 'test spec');
    expect(result.success).toBe(true);
    expect(failCount).toBe(2);  // 验证重试次数
  });
});
```

---

## 测试策略（ADR-0001 Q4）

### 默认 Mock 策略

```typescript
// test/workflows/single-feature.test.ts
import { vi } from 'vitest';

const USE_REAL_OMP = process.env.USE_REAL_OMP === 'true';

beforeEach(() => {
  if (!USE_REAL_OMP) {
    vi.mock('../../src/omp/runner', () => ({
      runOmp: vi.fn().mockResolvedValue({
        id: 'handoff-001',
        featureId: 'feat-001',
        salientSummary: 'Mock implementation',
        whatWasImplemented: ['Feature implemented'],
        whatWasLeftUndone: [],
        verification: { commandsRun: [], interactiveChecks: [] },
        tests: { added: [], coverage: '0%' },
        discoveredIssues: [],
        skillFeedback: { followedProcedure: true, deviations: [], suggestedChanges: [] },
        createdAt: new Date().toISOString()
      })
    }));
  }
});
```

### 可选真实调用

```bash
# 仅在需要时手动触发
USE_REAL_OMP=true pnpm run test
```

---

## 验收清单

- [ ] `pnpm run test` 全部通过
- [ ] `pnpm run type` 无类型错误
- [ ] `pnpm run lint` 无 lint 错误
- [ ] `pnpm run format` 格式检查通过
- [ ] 崩溃恢复测试：中断后 resume 不重复执行 step
- [ ] 失败重试测试：failed step 会重新执行
- [ ] Worktree 清理：成功时删除，失败时保留并打印路径
- [ ] Handoff schema 验证：非法 JSON 被拒绝

---

## 不做的事（封顶条款）

Phase 1 **严禁**实现以下能力：

- ❌ 分布式锁（单机单进程足够）
- ❌ Saga 补偿（依赖 git worktree cleanup）
- ❌ 子 workflow（Phase 1 仅 1 个 workflow）
- ❌ Event sourcing（直接存 step output）
- ❌ Tracing/metrics（Phase 1 仅 console.log）
- ❌ 并发控制（Phase 1 顺序执行）
- ❌ CLI 入口（Phase 2 添加）

若需要以上能力，必须切换到 DBOS（见 ADR-0001 升级路径）。

---

**最后更新**：2026-10-06  
**基于**：ADR-0001 Phase 1 持久化引擎选型裁决  
**验收标准**：`pnpm run test && pnpm run type && pnpm run lint && pnpm run format`
