# Lazyforeman Phase 1 实现任务

## 📋 任务目标

实现 **Phase 1: 地基（单 feature 最小闭环）**，建立 lazyforeman 的核心编排能力：

```
一个 feature → 一个 worktree → 一次 omp -p 调用
  → 一个 handoff 文件（过 schema 校验）
  → DBOS step 兜住重试与崩溃恢复
```

---

## 🎯 核心交付物

### 1. DBOS Transact 集成

**文件**：`src/db/client.ts`

**需求**：
- 使用 `@dbos-inc/dbos-sdk` 初始化 DBOS Transact
- 配置 SQLite 作为持久化存储（路径：`.lazyforeman/db.sqlite`）
- 提供 `@DBOS.step()` 装饰器封装

**参考**：
```typescript
import { DBOS } from '@dbos-inc/dbos-sdk';

export class LazyforemanDBOS {
  static async init() {
    // 初始化 DBOS Transact + SQLite
  }
}
```

---

### 2. SQLite Schema

**文件**：`src/db/schema.sql`

**需求**：
```sql
-- missions 表
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- features 表
CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
  fulfills TEXT, -- JSON array: ["VAL-001", "VAL-002"]
  preconditions TEXT, -- JSON array: ["feature-id-1"]
  current_worker_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

-- assertions 表
CREATE TABLE IF NOT EXISTS assertions (
  id TEXT PRIMARY KEY, -- VAL-001
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'passed', 'failed')),
  feature_id TEXT,
  evidence_path TEXT,
  validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- handoffs 表
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  content TEXT NOT NULL, -- JSON 序列化的完整 Handoff 对象
  created_at TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- progress_log 表
CREATE TABLE IF NOT EXISTS progress_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL, -- JSON
  timestamp TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

-- state 表（用于 resume）
CREATE TABLE IF NOT EXISTS state (
  mission_id TEXT PRIMARY KEY,
  last_reviewed_handoff_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);
```

---

### 3. Worktree 管理器

**文件**：`src/worktree/manager.ts`

**需求**：
- `createWorktree(featureId: string): Promise<string>` - 创建隔离 worktree
- `cleanupWorktree(path: string, keepOnFailure: boolean): Promise<void>` - 清理 worktree
- `mergeWorktree(path: string): Promise<void>` - 合并回主分支

**关键约束**：
- Worktree 路径：`/tmp/lazyforeman/{missionId}/{featureId}/` (Unix) 或 `%TEMP%\lazyforeman\{missionId}\{featureId}\` (Windows)
- 失败时保留 worktree 供 fix feature 复用
- 合并冲突时抛出异常，由 orchestrator 处理

---

### 4. Omp 调用封装

**文件**：`src/omp/runner.ts`

**需求**：
- 使用 `omp -p` 非交互模式调用
- 传递 feature 上下文（`feature.json`）
- 解析 Handoff 输出（JSON 格式）
- 校验 Handoff schema（使用 Zod 或 JSON Schema）

**Handoff Schema 校验**：
```typescript
import { z } from 'zod';

const HandoffSchema = z.object({
  salientSummary: z.string().min(1),
  whatWasImplemented: z.array(z.string()),
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
        verifies: z.string()
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
  })
});
```

---

### 5. DBOS Workflow

**文件**：`src/workflows/single-feature.ts`

**需求**：
```typescript
@DBOS.workflow()
export async function runSingleFeature(featureId: string) {
  // Step 1: 创建 worktree
  const worktreePath = await DBOS.step(createWorktree, featureId);
  
  try {
    // Step 2: 运行 omp
    const handoff = await DBOS.step(runOmp, worktreePath, featureId);
    
    // Step 3: 校验 Handoff schema
    await DBOS.step(validateHandoff, handoff);
    
    // Step 4: 保存 Handoff
    await DBOS.step(saveHandoff, featureId, handoff);
    
    // Step 5: 更新 Feature 状态
    await DBOS.step(updateFeatureStatus, featureId, 'completed');
    
    // Step 6: 合并 worktree
    await DBOS.step(mergeWorktree, worktreePath);
    
    return { success: true, handoff };
  } catch (error) {
    // 失败处理
    await DBOS.step(updateFeatureStatus, featureId, 'failed');
    await DBOS.step(cleanupWorktree, worktreePath, true); // 保留失败 worktree
    throw error;
  } finally {
    // 清理成功 worktree
    await DBOS.step(cleanupWorktree, worktreePath, false);
  }
}
```

---

### 6. 崩溃恢复测试

**文件**：`test/workflows/recovery.test.ts`

**需求**：
- 模拟中途 kill process
- 验证 DBOS resume 后从断点继续
- 验证不重复执行已完成的 step

**测试场景**：
```typescript
it('should resume from checkpoint after crash', async () => {
  // 1. 启动 workflow，在 Step 2 (runOmp) 后强制退出
  // 2. 重新启动 DBOS
  // 3. Resume workflow
  // 4. 验证 Step 1 (createWorktree) 没有重复执行
  // 5. 验证 Step 3-6 正常执行
});
```

---

## 🛠️ 技术栈要求

### 必须使用的依赖
```json
{
  "dependencies": {
    "@dbos-inc/dbos-sdk": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "zod": "^3.22.0"
  }
}
```

### Omp 假设
- 假设 `omp` 已在 PATH 中
- 调用命令：`omp -p --input feature.json --output handoff.json`
- 若 `omp` 不存在，使用 mock 实现（返回假 Handoff）

---

## ✅ 验收标准

### 功能验收
1. ✅ 能够成功执行 1 个 feature（端到端）
2. ✅ Handoff JSON 能够通过 schema 校验
3. ✅ Feature 状态正确更新到 SQLite（pending → in_progress → completed）
4. ✅ Worktree 创建、使用、合并、清理流程完整
5. ✅ 崩溃后能够 resume，不重复执行

### 质量验收
1. ✅ 所有类型定义有完整的 JSDoc 注释
2. ✅ 关键函数有单元测试
3. ✅ 集成测试覆盖端到端流程
4. ✅ `pnpm run format` 通过
5. ✅ `pnpm run lint` 通过
6. ✅ `pnpm run type` 通过
7. ✅ `pnpm run test` 通过

---

## 📚 参考资料

### DBOS 文档
- https://docs.dbos.dev/typescript/tutorials/quickstart
- https://docs.dbos.dev/typescript/reference/workflows

### 设计参考
- `docs/interviews/2026-10-06-droid-mission-deep-analysis.md`（深度分析报告）
- `CONTEXT.md`（项目上下文）

### 核心设计模式
- **Pattern 2**: Handoff Schema 自愈机制
- **Pattern 6**: Progress Log 驱动 Resume
- **Pattern 8**: Worktree 隔离与生命周期管理

---

## 🚫 明确不做的事情

Phase 1 **不包含**以下能力（留待后续 Phase）：

1. ❌ 断言覆盖率校验（Phase 2）
2. ❌ Evidence 文件验证（Phase 2）
3. ❌ 多 feature 顺序执行（Phase 3）
4. ❌ 依赖拓扑排序（Phase 3）
5. ❌ Validator 双轨验证（Phase 4）
6. ❌ DiscoveredIssues 处理（Phase 4）

Phase 1 只需证明：**1 个 feature 能跑通，崩溃能恢复**。

---

## 💡 提示

### Mock Omp 实现
如果 `omp` 不存在，可以先用 mock：

```typescript
// src/omp/mock-runner.ts
export async function mockRunOmp(featureId: string): Promise<Handoff> {
  return {
    salientSummary: `Mock implementation for ${featureId}`,
    whatWasImplemented: ['Mock task 1', 'Mock task 2'],
    whatWasLeftUndone: [],
    verification: {
      commandsRun: [{ command: 'echo "mock"', exitCode: 0, observation: 'Success' }],
      interactiveChecks: []
    },
    tests: {
      added: [],
      coverage: 'N/A (mock)'
    },
    discoveredIssues: [],
    skillFeedback: {
      followedProcedure: true,
      deviations: [],
      suggestedChanges: []
    }
  };
}
```

### SQLite 初始化
在 DBOS init 时自动执行 schema.sql：

```typescript
import fs from 'node:fs';
import Database from 'better-sqlite3';

const db = new Database('.lazyforeman/db.sqlite');
const schema = fs.readFileSync('src/db/schema.sql', 'utf-8');
db.exec(schema);
```

---

## 🎯 成功标志

当你能运行以下命令并看到成功输出时，Phase 1 完成：

```bash
# 1. 格式、lint、类型检查全部通过
pnpm run format && pnpm run lint && pnpm run type

# 2. 测试全部通过（包括崩溃恢复测试）
pnpm run test

# 3. 端到端测试
node --loader ts-node/esm src/cli.ts run-feature test-feature-001

# 预期输出：
# ✅ Feature test-feature-001 completed
# ✅ Handoff saved to .lazyforeman/handoffs/test-feature-001.json
# ✅ Worktree merged and cleaned up
```

---

祝你实现顺利！遇到问题随时回来讨论。
