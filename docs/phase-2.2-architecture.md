# Phase 2.2 架构设计：Lazy 契约工作流增强

## 概述

Phase 2.2 实现了系统的自愈能力，让 lazyforeman 可以：
- 从粗略目标深挖出高质量 mission.md（Grill-with-docs）
- Worker 挑战错误的契约假设（discoveredIssues）
- Orchestrator 智能调整计划（动态调整）
- 暂停并等待人工裁决（send/recv 信号）
- 多 AI 协商解决冲突（多 AI 裁决）

## 架构图

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 粗略目标
       ▼
┌─────────────────────────────────────┐
│  Grill Agent (五维深挖)              │
│  ├─ 目标澄清                         │
│  ├─ 边界确认                         │
│  ├─ 技术约束 (Wayfinder 集成)       │
│  ├─ 验收标准细化                     │
│  └─ 风险识别                         │
└──────┬──────────────────────────────┘
       │ mission.md
       ▼
┌─────────────────────────────────────┐
│  Mission Workflow                   │
│  └─> assertions.json + features.json│
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Worker 执行                         │
│  └─> handoff (含 discoveredIssues)  │
└──────┬──────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  Issues Handler (场景判定)            │
│  ├─ 依赖缺失? → auto_adjust          │
│  ├─ 架构冲突? → pause (send signal)  │
│  └─ 断言不可行? → auto_adjust        │
└──────┬───────────────────────────────┘
       │
       ├─> [auto_adjust] Plan Adjuster
       │   └─> 生成新 feature / 修正断言
       │
       └─> [pause] Signal Manager
           ├─ send() 暂停 workflow
           └─ recv() 恢复 workflow
```

## 核心模块

### 1. Grill Agent

**职责**：从粗略目标生成高质量 mission.md

**五维深挖**：
1. 目标澄清：这个功能解决什么问题？
2. 边界确认：哪些做？哪些不做？
3. 技术约束：现有架构？技术债？
4. 验收标准细化：如何验证？
5. 风险识别：哪些地方可能出问题？

**Wayfinder 集成**：
- 检测关键词（"现有"、"当前"、"基于"）
- 调用 `WayfinderClient.exploreArchitecture()`
- 将发现写入"架构约束"章节

**交互模式**：
- 多轮对话：用户回答 Grill 提问
- 逐维度推进：完成一维再进入下一维
- 上下文保持：历史对话影响后续提问

**输出质量门禁**：
- mission.md 必须包含所有六大章节
- 成功标准至少 3 条可验证断言
- 边界章节明确列出 ✅ 做 / ❌ 不做

### 2. Worker 契约挑战

**discoveredIssues 机制**：
- Worker 通过 `handoff.discoveredIssues` 报告问题
- 包含：severity, category, description, suggestedFix
- 6 种类别：dependency_missing, architecture_conflict, assertion_infeasible, scope_ambiguity, technical_constraint, other

**Handoff Schema 扩展**：
```typescript
interface Handoff {
  featureId: string;
  status: 'success' | 'failed' | 'blocked';
  
  // 新增字段
  discoveredIssues?: DiscoveredIssue[];
  
  verification: {
    commandsRun: string[];
    evidenceFiles: string[];
  };
}

interface DiscoveredIssue {
  severity: 'blocking' | 'major' | 'minor';
  category: 'dependency_missing' | 'architecture_conflict' | 
            'assertion_infeasible' | 'scope_ambiguity' | 
            'technical_constraint' | 'other';
  description: string;
  context?: string;
  suggestedFix?: string;
  affectedAssertions?: string[];
}
```

**Worker 报告时机**：
- 实现前发现：在 handoff 中报告，status = 'blocked'
- 实现中发现：尝试修复，失败则报告
- 验证时发现：evidence 显示不可行，报告到 handoff

### 3. Orchestrator 动态调整

**三种场景处理**：

#### 场景 1：依赖缺失
```
Worker 报告：category = dependency_missing
  ↓
Issues Handler 判定：action = auto_adjust
  ↓
Plan Adjuster:
  1. 生成新 feature (feat-N+1)
  2. 更新原 feature.preconditions = ["feat-N+1"]
  3. 重新拓扑排序
  4. 更新 features.json
  ↓
重新调度：先执行 feat-N+1，再执行原 feature
```

**示例**：
- 原 feature: "实现登录表单"
- 发现问题: "缺少 /api/v1/login 后端接口"
- 自动调整: 生成 "实现后端登录接口" feature，设为前置依赖

#### 场景 2：架构假设错误
```
Worker 报告：category = architecture_conflict
  ↓
Vision Conflict Detector 分析：
  - 重大冲突：与 mission 核心目标或边界矛盾
  - 轻微冲突：实现细节分歧，不影响验收标准
  ↓
重大冲突 → send() 信号，暂停 workflow，等待人工裁决
轻微冲突 → 多 AI 裁决（自动协商）
```

**愿景冲突检测规则**：
- **重大冲突**：
  - 实现方向违反 mission.boundary（做了标记为 ❌ 的事）
  - 核心成功标准无法满足
  - 架构约束被根本违反（如：要求无数据库但依赖 DB）
  
- **轻微冲突**：
  - 技术选型分歧（React vs Vue）
  - API 设计分歧（REST vs GraphQL）
  - 数据结构分歧（JSON vs YAML）

#### 场景 3：断言不可行
```
Worker 报告：category = assertion_infeasible
  ↓
Issues Handler 判定：action = auto_adjust
  ↓
Plan Adjuster:
  1. 标记断言为 infeasible（assertions 表）
  2. 更新 features.json（移除该断言从 fulfills 数组）
  3. 重新验证覆盖（Coverage Validator）
  4. 若出现孤儿断言 → send() 信号，等待人工决策
  ↓
继续执行剩余 features
```

**断言不可行判定**：
- Worker 提供证据：技术限制、第三方 API 限制、物理约束
- 影响评估：该断言是否为核心验收标准
- 核心标准不可行 → 重大冲突，暂停等待人工
- 次要标准不可行 → 自动标记，继续执行

### 4. send()/recv() 信号机制

**send() - 暂停 workflow**：
```typescript
async function send(signal: Signal): Promise<void> {
  // 1. 持久化 signal 到 SQLite
  await db.insert('signals', {
    type: signal.type,
    status: 'pending',
    payload: JSON.stringify(signal.payload),
    created_at: new Date()
  });
  
  // 2. 抛出 SignalPauseException
  throw new SignalPauseException(signal.id);
}
```

**recv() - 恢复 workflow**：
```typescript
async function recv(signalId: string): Promise<SignalResolution> {
  // 1. 查询 signal 状态
  const signal = await db.query('signals', { id: signalId });
  
  // 2. 若状态为 pending，等待用户裁决
  if (signal.status === 'pending') {
    await waitForResolution(signalId);
  }
  
  // 3. 返回用户决策
  return signal.resolution;
}
```

**Signal 类型定义**：
```typescript
interface Signal {
  id: string;
  type: 'vision_conflict' | 'coverage_violation' | 'critical_failure';
  status: 'pending' | 'resolved' | 'rejected';
  payload: {
    feature_id?: string;
    issue: DiscoveredIssue;
    context: string;
  };
  resolution?: SignalResolution;
}

interface SignalResolution {
  action: 'approve' | 'reject' | 'modify';
  reason: string;
  modifications?: {
    update_mission?: Partial<MissionDocument>;
    update_assertions?: Array<{ id: string; changes: any }>;
    update_features?: Array<{ id: string; changes: any }>;
  };
}
```

**用户交互界面**（CLI 实现）：
```bash
foreman signals list
# 显示所有 pending signals

foreman signals resolve <signal-id> --action approve --reason "理由"
# 批准方案，继续执行

foreman signals resolve <signal-id> --action reject --reason "理由"
# 拒绝方案，终止 mission

foreman signals resolve <signal-id> --action modify --file changes.json
# 修改契约，重新规划
```

### 5. 多 AI 裁决

**三轮流程**：

#### 第一轮：独立提案
```
并行调用 3-5 个 AI 模型（Opus、GPT-4、Gemini 等）
  ↓
每个 AI 独立分析冲突，提出解决方案
  ↓
方案格式：
  - 问题分析
  - 解决方向（A: 修改 mission / B: 修改实现）
  - 具体操作
  - 风险评估
```

#### 第二轮：互评
```
每个 AI 收到其他 AI 的方案
  ↓
要求：至少驳一人（指出缺陷）+ 认一人（支持理由）
  ↓
评审格式：
  - 我支持方案 X，因为...
  - 我反对方案 Y，因为...
  - 我的方案优势在于...
```

#### 第三轮：修订投票
```
每个 AI 基于评审意见修订自己的方案
  ↓
投票：每人选择自己认为最优的方案（可以投自己）
  ↓
结果判定：
  - consensus: 全体一致 (100%)
  - majority: 多数胜出 (> 50%)
  - deadlock: 僵局 → 升级到人工裁决
```

**结果归档**：
```
.lazyforeman/missions/<mission-name>/decisions/<timestamp>-<issue>/
├── metadata.json          # 冲突元数据
├── round-1.json           # 第一轮独立提案
├── round-2.json           # 第二轮互评
├── round-3.json           # 第三轮修订投票
├── outcome.json           # 最终结果
└── README.md              # 人类可读摘要
```

**裁决器接口**：
```typescript
interface Adjudicator {
  adjudicate(issue: DiscoveredIssue, context: AdjudicationContext): Promise<AdjudicationOutcome>;
}

interface AdjudicationContext {
  mission: MissionDocument;
  assertions: Assertion[];
  features: Feature[];
  feature_id: string;
  handoff: Handoff;
}

interface AdjudicationOutcome {
  status: 'consensus' | 'majority' | 'deadlock';
  decision: 'approve' | 'reject' | 'modify';
  rationale: string;
  modifications?: any;
  archive_path: string;
}
```

## 数据流

### 完整流程示例：依赖缺失自动调整

```
1. User: "实现登录功能"
   ↓
2. Grill Agent 生成 mission.md
   ├─ 目标：用户可以登录
   ├─ 边界：✅ 邮箱密码登录  ❌ 社交登录
   └─ 成功标准：用户可以用邮箱密码登录
   ↓
3. Mission Workflow
   ├─ assertions.json: VAL-001 "用户可以登录"
   └─ features.json: feat-001 "实现登录表单"
   ↓
4. Worker 执行 feat-001
   └─ handoff.discoveredIssues:
       {
         severity: "blocking",
         category: "dependency_missing",
         description: "缺少 /api/v1/login 后端接口",
         suggestedFix: "先实现后端接口"
       }
   ↓
5. Issues Handler 判定
   ├─ category = dependency_missing
   └─ action = auto_adjust
   ↓
6. Plan Adjuster
   ├─ 生成 feat-002: "实现后端登录接口"
   ├─ 更新 feat-001.preconditions = ["feat-002"]
   └─ 重新调度: feat-002 → feat-001
   ↓
7. 继续执行
```

### 完整流程示例：架构冲突人工裁决

```
1. Worker 执行 feat-003 "集成第三方支付"
   └─ handoff.discoveredIssues:
       {
         severity: "blocking",
         category: "architecture_conflict",
         description: "mission 要求无外部依赖，但支付必须调用第三方 API",
         affectedAssertions: ["VAL-005"]
       }
   ↓
2. Vision Conflict Detector
   └─ 判定：重大冲突（违反核心架构约束）
   ↓
3. Signal Manager.send()
   ├─ 创建 signal (type: vision_conflict, status: pending)
   └─ 抛出 SignalPauseException，暂停 workflow
   ↓
4. 用户收到通知
   └─ foreman signals list 查看详情
   ↓
5. 用户裁决
   ├─ 选项 A: 修改 mission（放宽架构约束，允许第三方 API）
   ├─ 选项 B: 修改实现（改用本地支付模拟）
   └─ 选项 C: 终止 mission（需求不可行）
   ↓
6. 用户执行：foreman signals resolve <id> --action modify --file changes.json
   └─ changes.json:
       {
         "update_mission": {
           "architectureConstraints": "允许调用 Stripe API 用于支付处理"
         }
       }
   ↓
7. Signal Manager.recv()
   ├─ 更新 mission.md
   ├─ 更新 signal.status = resolved
   └─ 返回 resolution
   ↓
8. Plan Adjuster 根据 resolution 调整计划
   └─ 更新 feat-003 实现方向
   ↓
9. 恢复执行
```

## 存储设计

### SQLite 表

#### discovered_issues 表
```sql
CREATE TABLE discovered_issues (
  id TEXT PRIMARY KEY,
  handoff_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  severity TEXT NOT NULL,  -- blocking, major, minor
  category TEXT NOT NULL,  -- dependency_missing, architecture_conflict, etc.
  description TEXT NOT NULL,
  context TEXT,
  suggested_fix TEXT,
  affected_assertions_json TEXT,  -- JSON array of assertion IDs
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (handoff_id) REFERENCES handoffs(id),
  FOREIGN KEY (feature_id) REFERENCES features(id)
);
```

#### signals 表
```sql
CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- vision_conflict, coverage_violation, critical_failure
  status TEXT NOT NULL,  -- pending, resolved, rejected
  payload_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolution_json TEXT,
  
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

#### grill_sessions 表
```sql
CREATE TABLE grill_sessions (
  id TEXT PRIMARY KEY,
  rough_goal TEXT NOT NULL,
  generated_mission TEXT,
  messages_json TEXT NOT NULL,  -- 对话历史
  status TEXT NOT NULL,  -- in_progress, completed, abandoned
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

### 文件系统

#### 裁决归档目录结构
```
.lazyforeman/missions/<mission-name>/decisions/
├── 2026-10-06-1830-architecture-conflict-feat-003/
│   ├── metadata.json
│   ├── round-1.json
│   ├── round-2.json
│   ├── round-3.json
│   ├── outcome.json
│   └── README.md
├── 2026-10-07-0915-coverage-violation-VAL-012/
│   └── ...
```

#### metadata.json 格式
```json
{
  "issue_id": "issue_abc123",
  "feature_id": "feat-003",
  "category": "architecture_conflict",
  "severity": "blocking",
  "description": "...",
  "affected_assertions": ["VAL-005"],
  "timestamp": "2026-10-06T18:30:00Z",
  "participants": ["claude-opus-5", "gpt-4", "gemini-pro"]
}
```

## 测试策略

### 单元测试

每个模块 ≥ 80% 覆盖率：

- **Grill Agent**: 五维深挖逻辑，Wayfinder 集成，质量门禁
- **Issues Handler**: 场景分类，action 决策
- **Issues Classifier**: severity/category 判定
- **Vision Conflict Detector**: 三级冲突判定（重大/轻微/无冲突）
- **Plan Adjuster**: 三种场景处理（依赖缺失/架构冲突/断言不可行）
- **Signal Manager**: send/recv 语义，持久化，超时处理
- **Adjudicator**: 三轮流程，结果判定，归档

### 集成测试

模块协作测试：

- **Grill → Mission Workflow**: mission.md 生成 → 解析 → 断言提取
- **Worker → Issues Handler**: discoveredIssues 上报 → 场景判定
- **Issues Handler → Plan Adjuster**: action 决策 → 动态调整
- **Plan Adjuster → Coverage Validator**: 调整后重新验证覆盖
- **Signal Manager → Workflow Runner**: send 暂停 → recv 恢复

### 端到端测试

至少 2 个完整场景：

#### 场景 1：依赖缺失自动调整
```
输入：粗略目标 "实现登录功能"
  ↓
Grill Agent 生成 mission.md
  ↓
Mission Workflow 生成 features.json (feat-001: 登录表单)
  ↓
Worker 报告：缺少后端接口
  ↓
Plan Adjuster 自动生成 feat-002，调整依赖
  ↓
重新执行：feat-002 → feat-001
  ↓
验证：两个 feature 都完成，断言全部通过
```

#### 场景 2：架构冲突人工裁决
```
输入：mission.md (架构约束：无外部依赖)
  ↓
Worker 执行 feat-003，发现必须调用第三方 API
  ↓
Vision Conflict Detector 判定重大冲突
  ↓
Signal Manager.send() 暂停
  ↓
用户裁决：修改 mission，允许第三方 API
  ↓
Signal Manager.recv() 恢复
  ↓
Plan Adjuster 调整计划
  ↓
继续执行，完成 mission
```

### 崩溃恢复测试

各阶段注入崩溃，验证恢复：

- Grill 对话中途崩溃 → 从 grill_sessions 表恢复
- Issues Handler 判定中崩溃 → 重新读取 handoff，重新判定
- Plan Adjuster 调整中崩溃 → DAG 部分更新，rollback 重试
- Signal 等待中崩溃 → signal 状态保持 pending，重启后继续等待
- 多 AI 裁决中崩溃 → 从 decisions 目录恢复已完成轮次

## 性能约束

- **Grill 对话轮次**：≤ 10 轮（超过则强制生成 mission.md）
- **多 AI 裁决参与者**：3-5 个（平衡准确性与成本）
- **Signal 超时**：24 小时（超时自动 reject，终止 mission）
- **决策归档大小**：< 10MB（超过则压缩或截断）
- **Wayfinder 缓存 TTL**：7 天（避免过期架构信息）

## 与 Phase 2.1 的集成

Phase 2.2 增强建立在 Phase 2.1 基础上：

- **复用 Mission Parser**：Grill 生成的 mission.md 使用相同格式
- **复用 Wayfinder**：Grill 调用 Wayfinder 探索架构
- **复用 Coverage Validator**：动态调整后重新验证覆盖
- **扩展 Handoff Schema**：新增 discoveredIssues 字段
- **扩展 Workflow Runner**：支持 send/recv 语义

## 未来扩展

Phase 3+ 可能增强：

- **分布式裁决**：多个 mission 并行执行时的冲突协调
- **学习机制**：从历史裁决中学习，减少人工介入
- **预测性调整**：在 Worker 执行前预测可能的冲突
- **可视化界面**：Web UI 展示 mission 进度、signal 状态、裁决历史
