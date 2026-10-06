# ADR-0003: 契约格式与 Lazy 工作流设计

**状态**：已批准 (Approved)  
**日期**：2026-10-06  
**决策者**：用户 + Claude (Sonnet 5.5)  
**相关 ADR**：ADR-0001 (Phase 1 持久化引擎)  
**相关访谈**：`docs/interviews/2026-10-06-contract-format-and-orchestrator-design.md`

---

## 1. 背景与问题

### 1.1 需求

设计契约格式，用于描述：
- 用户想要什么（Mission 目标）
- 系统应该如何表现（Assertions 验收断言）
- Worker 需要实现什么（Features 任务单元）

**服务对象**：
1. 人类阅读和编写
2. AI Worker 理解和执行
3. Validator 自动验证

### 1.2 核心挑战

1. **断言账本是核心创新**
   - droid mission 最亮眼的设计：开工前校验"每条 VAL-* 断言恰好被一个 feature 认领"
   - 需要断言是一等公民，有独立 ID
   - 需要 Feature 显式认领：`fulfills: [VAL-001, VAL-002]`

2. **现有格式不匹配**
   - BMAD (Matt Pocock)：PRD → Arch → Story，但 Story 没有"认领断言"机制
   - Spec Kit (GitHub 130K+ stars)：Acceptance Criteria 嵌在 spec 里，不是独立清单
   - 两者都不是为断言账本设计的

3. **Lazy 原则**
   - 能自动化的绝不手写
   - 能推导的绝不重复记录
   - 能渐进的绝不一次性全写

---

## 2. 决策

### 2.1 选择方案 C：Lazyforeman 自研契约格式

**不选 BMAD 或 Spec Kit，设计自己的契约格式。**

**理由**：
- 断言账本是核心创新，不应被现有格式约束
- 可以吸收 BMAD 的角色流清晰性 + Spec Kit 的轻量感
- 为开工前硬门禁量身定制

### 2.2 文件结构

```
.lazyforeman/missions/<mission-name>/
├── mission.md          # 【人工】高层目标（或对话生成）
├── assertions.json     # 【自动】从 mission.md 提取的断言
├── features.json       # 【自动】Worker 认领后生成
└── progress.json       # 【自动】实时进度
```

**核心原则**：只有 `mission.md` 需要人维护（或对话生成），其他全自动。

### 2.3 单一事实源

| 文件 | 角色 | 维护方式 | 内容 |
|------|------|----------|------|
| `mission.md` | 唯一事实源 | 人工编写或对话生成 | 目标、边界、架构约束、风险 |
| `assertions.json` | 派生产物 | 自动提取 | VAL-* 断言清单 |
| `features.json` | 派生产物 | 自动拆分 | 任务单元 + 认领关系 |
| `progress.json` | 派生产物 | 实时更新 | 执行状态 |

---

## 3. 契约格式定义

### 3.1 mission.md

**格式**：Markdown  
**维护者**：人工（或 Grill-with-docs 对话生成）

**必需章节**（经过彻底 Grill 后）：

```markdown
# Mission: <任务名称>

## 背景（Grill 产出）
- 当前系统状态
- 用户痛点
- 技术现状

## 目标（Grill 确认）
用一句话描述这个 Mission 要达成什么。

## 边界（Grill 确认）
✅ 做：列出范围内的事项
❌ 不做：列出明确排除的事项

## 成功标准
- [ ] 标准 1（可验证）
- [ ] 标准 2（可验证）

## 架构约束（Grill 挖掘）
- 现有组件可复用清单
- 技术栈要求
- 性能/安全约束

## 风险（Grill 识别）
⚠️ 风险 1：描述 + 影响
⚠️ 风险 2：描述 + 预先调研计划
```

### 3.2 assertions.json

**格式**：JSON  
**生成方式**：Investigator Agent 从 `mission.md` 提取

```json
{
  "assertions": [
    {
      "id": "VAL-001",
      "description": "用户可以用邮箱和密码登录",
      "type": "deterministic",
      "status": "pending",
      "claimedBy": null,
      "evidencePath": null,
      "validatedAt": null,
      "createdAt": "2026-10-06T10:00:00Z",
      "updatedAt": "2026-10-06T10:00:00Z"
    }
  ]
}
```

**字段说明**：
- `id`: VAL-* 唯一标识符
- `type`: `deterministic`（脚本可判）或 `semantic`（模型判）
- `status`: `pending` | `passed` | `failed`
- `claimedBy`: 认领此断言的 Feature ID

### 3.3 features.json

**格式**：JSON  
**生成方式**：Planner Agent 拆分任务

```json
{
  "features": [
    {
      "id": "feat-001",
      "name": "实现登录表单",
      "description": "前端登录表单，包含邮箱、密码输入框和提交按钮",
      "fulfills": ["VAL-001", "VAL-002"],
      "preconditions": [],
      "status": "pending",
      "currentWorkerSessionId": null,
      "createdAt": "2026-10-06T10:05:00Z",
      "updatedAt": "2026-10-06T10:05:00Z"
    }
  ]
}
```

**字段说明**：
- `fulfills`: 认领的断言 ID 列表（每个断言只能被一个 Feature 认领）
- `preconditions`: 前置依赖的 Feature ID 列表（DAG）
- `status`: `pending` | `in_progress` | `completed` | `failed`

---

## 4. Lazy 工作流（六阶段）

### 阶段 1：规划（Planner）

**输入**：用户需求（文字描述或对话）  
**输出**：`mission.md`  
**工具**：手写或 `/grill-with-docs` 对话生成

**关键：Grill 必须彻底**（见 §5）

### 阶段 2：提取断言（Investigator Agent）

**输入**：`mission.md`  
**输出**：`assertions.json`

**算法**：
1. 解析 `mission.md` 的"成功标准"章节
2. 为每个标准生成唯一 VAL-* ID
3. 分类为 deterministic 或 semantic
4. 初始化状态为 `pending`

### 阶段 3：拆分任务（Planner Agent）

**输入**：`mission.md` + `assertions.json`  
**输出**：`features.json`

**算法**：
1. 读取 mission.md 的目标和架构约束
2. 将任务拆分为可独立执行的 Feature
3. 为每个 Feature 分配认领的断言（`fulfills`）
4. 分析依赖关系，填充 `preconditions`

### 阶段 4：开工前硬门禁

**校验规则**：
```typescript
export function validateAssertionCoverage(
  assertions: Assertion[],
  features: Feature[]
): void {
  for (const assertion of assertions) {
    const claimers = features.filter(f =>
      f.fulfills.includes(assertion.id)
    );
    
    if (claimers.length === 0) {
      throw new Error(
        `断言 ${assertion.id} 无人认领`
      );
    }
    
    if (claimers.length > 1) {
      throw new Error(
        `断言 ${assertion.id} 被多个 Feature 认领: ${claimers.map(f => f.id).join(', ')}`
      );
    }
  }
}
```

**不通过则禁止开工。**

### 阶段 5：执行（Implementer）

**输入**：单个 Feature  
**输出**：Handoff

**流程**：
1. Orchestrator 按依赖顺序调度 Feature
2. Worker 在隔离 worktree 中执行
3. 产出 handoff.json（包含 discoveredIssues）
4. Orchestrator 读取 handoff，决定下一步（见 §6）

### 阶段 6：验证（Validator）

**输入**：`assertions.json` + `features.json` + Handoff 列表  
**输出**：更新后的 `assertions.json`

**流程**：
1. 逐个断言验证
2. deterministic 断言用脚本验证
3. semantic 断言用模型验证
4. 更新状态：`passed` | `failed`

---

## 5. Grill-with-docs 深度访谈机制

### 5.1 核心原则

**用户原话**：
> "前期的 grill 一定要非常彻底，我建议是 grill-with-docs 或者 wayfinder 来做"

**目标**：输出高质量的 `mission.md`，避免执行中返工。

### 5.2 五维深挖

#### 维度 1：目标澄清
- 这个功能解决什么问题？
- 谁会用？怎么用？
- 成功的标准是什么？

#### 维度 2：边界确认
- 哪些在范围内？哪些不做？
- 依赖哪些现有系统？
- 有哪些已知的坑？

#### 维度 3：技术约束
- 现有架构是什么样的？（调 Wayfinder 探索）
- 有哪些技术债？
- 性能/安全有什么要求?

#### 维度 4：验收标准细化
- 每个"成功标准"具体怎么验证？
- 是自动化测试还是人工检查？
- 边界情况有哪些？

#### 维度 5：风险识别
- 哪些地方可能出问题？
- 有哪些不确定的地方？
- 需要预先调研什么？

### 5.3 Wayfinder 集成

**场景**：用户提到现有组件

```
Grill: "你说后端已有 bcrypt，在哪？"
  ↓
调用 Wayfinder: 搜索代码库中 bcrypt 的使用
  ↓
Wayfinder 返回:
  - package.json: "bcrypt": "^5.0.1"
  - src/auth/hash.ts: 已封装 hashPassword
  - ✅ 可以直接复用
  ↓
Grill 更新 mission.md:
  ## 架构约束
  - 复用 src/auth/hash.ts 的 hashPassword
```

**可用工具**：
- CodeGraph (`/understand-codebase`)
- `mcp__codegraph__codegraph_explore`
- Grep / Read

### 5.4 质量门禁

经过彻底 Grill 的 `mission.md` 必须包含：

✅ 背景章节（不少于 3 句）  
✅ 边界章节（至少 1 个 ✅ 和 1 个 ❌）  
✅ 架构约束章节（不为空）  
✅ 风险章节（至少 1 个 ⚠️）

---

## 6. Orchestrator 动态计划调整

### 6.1 核心原则

**用户原话**：
> "在具体执行过程中 orchestrator 需要根据其他代理的反馈要能修改任务。不然任务在执行的时候遇到和 plan 不一致的情况还是硬做那就完蛋了"

### 6.2 愿景守护机制（防偏离初衷）

**用户原话**：
> "因为现在很多时候人也不知道怎么选，那么可以用 lazypack 中的设定，比如多 AI 裁决。但是在修改前一定再加一道验证，就是和人最初访谈中的愿景是否有冲突，如果有这种重大冲突的，必须问人的意见（可以用比如一些 skill 更好说明，比如 eli5，wait-what，archify 等等）"

**核心机制**：在执行任何重大调整前，增加**愿景一致性验证**

#### 愿景冲突检测流程

```
Worker 提出重大调整（修改断言 / 改架构 / 取消 Mission）
  ↓
【步骤 1】愿景冲突检测
  ├─ 读取初始访谈记录（mission-kickoff.md）
  ├─ 读取 mission.md（用户的核心目标）
  ├─ 用 AI 判断：提议的改动是否与初衷冲突？
  └─ 分类：重大冲突 / 轻微冲突 / 无冲突
  ↓
如果存在重大冲突 → 跳转到【人工裁决】
  ↓
如果无重大冲突，但人不知道怎么选 → 【多 AI 裁决】
  ↓
【步骤 2】多 AI 裁决（§9 讨论章程）
  ├─ 第一轮：3+ 个 AI 独立提案（互不可见）
  ├─ 第二轮：互评（每人至少驳一人、认一人）
  └─ 第三轮：修订后投票 → 多数方案胜出
  ↓
如果僵局 → 回到【人工裁决】
  ↓
【步骤 3】解释性说明（辅助人类理解）
  ├─ /eli5：用简单语言解释技术问题
  ├─ wait-what：质疑提案的隐含假设
  └─ archify：可视化架构影响
  ↓
最终裁决 → 更新计划 → 重新调度
```

#### 愿景冲突判定标准

| 冲突等级 | 定义 | 处理方式 |
|----------|------|----------|
| **重大冲突** | 改动违背了用户明确表达的目标、边界或核心约束 | 必须问人，不得自动执行 |
| **轻微冲突** | 改动调整了实现细节，但核心目标不变 | 可以多 AI 裁决，结果告知用户 |
| **无冲突** | 改动是技术调整，不影响用户愿景 | Orchestrator 自动执行 |

**示例**：

| 提议的改动 | 原始愿景 | 冲突判定 |
|-----------|----------|----------|
| "VAL-002 无法实现，建议降低要求" | 用户访谈中强调"密码错误必须显示清晰提示" | ❌ 重大冲突 → 必须问人 |
| "建议改用 RSA 而非对称密钥" | 用户未指定加密方式，只说"要安全" | ✅ 无冲突 → Orchestrator 自动执行 |
| "建议拆分为两个 Feature" | 用户要求"一次性完成登录功能" | ⚠️ 轻微冲突 → 多 AI 裁决 |

#### 多 AI 裁决机制（lazypack-discipline §9）

**来源**：`lazypack-discipline` DECISIONS.md §9 多 AI 讨论章程

**适用场景**：
- 人类不确定如何选择
- 需要多角度评估
- 技术方案存在争议

**流程**：

```typescript
// 第一轮：独立提案（3+ 个 AI 互不可见）
const proposals = await parallel([
  () => agent('参与者 1：为问题提出解决方案', { phase: '第一轮' }),
  () => agent('参与者 2：为问题提出解决方案', { phase: '第一轮' }),
  () => agent('参与者 3：为问题提出解决方案', { phase: '第一轮' })
]);

// 第二轮：互评（每人至少驳一人、认一人）
const reviews = await parallel(
  proposals.map((p, i) => () =>
    agent(`评审其他提案，必须至少驳一人、认一人`, { phase: '第二轮' })
  )
);

// 第三轮：修订后投票
const votes = await parallel(
  proposals.map((p, i) => () =>
    agent(`基于评审意见修订提案并投票`, { phase: '第三轮' })
  )
);

// 统计结果：多数方案胜出，僵局交用户裁决
const winner = tallyVotes(votes);
```

**留档要求**：
- 每人每轮原文 + 投票结果 + 裁决
- 存入 `.lazyforeman/missions/<mission-name>/decisions/<date>-<issue>/`

#### 解释性说明（辅助人类理解）

当需要人工裁决时，提供三层说明：

```typescript
// 1. eli5: 用简单语言解释问题
const eli5 = await callSkill('eli5', {
  topic: issue.description
});
// 输出示例：
// "后端就像一个保险箱，它不会告诉你是密码错了还是账号错了，
//  因为这样小偷就能猜出哪个账号存在。但是用户希望看到清楚的提示，
//  这就产生了矛盾。"

// 2. wait-what: 质疑提案的隐含假设
const critique = await callSkill('wait-what', {
  proposal: proposedSolution.description
});
// 输出示例：
// "提案假设后端可以轻易修改，但如果后端是第三方服务呢？
//  提案假设用户愿意接受模糊提示，但访谈中用户明确要求清晰反馈。"

// 3. archify: 可视化架构影响
const diagram = await callSkill('archify', {
  type: 'sequence',
  description: proposedSolution.architectureImpact
});
// 输出示例：生成时序图，展示修改后的登录流程
```

### 6.3 三种调整场景

#### 场景 1：Worker 发现依赖缺失

```
Worker (feat-001): 实现登录表单
  ↓
Worker handoff.discoveredIssues:
  {
    "severity": "blocking",
    "description": "缺少 /api/v1/login 后端接口",
    "suggestedFix": "需要先实现后端接口"
  }
  ↓
【愿景冲突检测】无冲突（技术依赖，不影响用户愿景）
  ↓
Orchestrator 自动处理:
  1. 调用 Planner 生成新 Feature (feat-002: 后端接口)
  2. 更新 feat-001.preconditions = ["feat-002"]
  3. 重新调度: feat-002 → feat-001
```

#### 场景 2：Worker 发现架构假设错误

```
Worker (feat-003): 实现 JWT 验证
  ↓
Worker handoff.skillFeedback.deviations:
  {
    "step": "生成 JWT",
    "whatIDidInstead": "使用 RSA 私钥签名",
    "why": "保持与现有认证体系一致"
  }
  ↓
【愿景冲突检测】轻微冲突（用户未指定加密方式，但强调"与现有系统兼容"）
  ↓
【多 AI 裁决】（如果人不确定）
  ├─ 提案 1: 使用 RSA（保持一致）
  ├─ 提案 2: 使用对称密钥（更简单）
  └─ 投票结果: 2:1 支持 RSA
  ↓
Orchestrator 处理:
  1. 调用 Planner 更新 mission.md 架构备注
  2. 继续执行，无需阻塞
  3. 留档决策过程到 .lazyforeman/missions/<name>/decisions/
```

#### 场景 3：Worker 挑战契约（见 IDEA-261006-12）

```
Worker (feat-005): 实现密码错误提示
  ↓
Worker handoff.discoveredIssues:
  {
    "severity": "blocking",
    "description": "VAL-002 无法实现：后端不区分错误类型",
    "suggestedFix": "修改 VAL-002 或增加后端支持"
  }
  ↓
【步骤 1】愿景冲突检测
  ├─ 读取 mission-kickoff.md: "用户强调密码错误必须显示清晰提示"
  ├─ 读取 mission.md: "VAL-002: 密码错误时显示'密码错误'"
  └─ 判定: ❌ 重大冲突（降低要求违背用户明确表达的核心目标）
  ↓
【步骤 2】解释性说明
  ├─ eli5: "后端像保险箱，不会说密码错还是账号错，但用户要清晰提示"
  ├─ wait-what: "假设后端可以轻易修改，但如果是第三方服务呢？"
  └─ archify: [生成时序图展示两种方案的流程差异]
  ↓
【步骤 3】人工裁决（必须问人）
  ├─ 展示冲突分析 + 解释性说明
  ├─ 提供选项:
  │   1. 修改 VAL-002（降低要求，与愿景冲突）
  │   2. 增加 feat-006（后端支持详细错误码）
  │   3. 取消 Mission（重新规划）
  └─ 用户选择 2
  ↓
Planner 更新 features.json:
  {
    "id": "feat-006",
    "name": "后端返回详细登录错误码",
    "fulfills": [],  // 不直接满足 VAL-*，但支撑 VAL-002
    "preconditions": []
  }
  ↓
Orchestrator: "重新调度，feat-006 → feat-005"
```

### 6.4 实现要点

**依赖**：
- Handoff schema 已定义 `discoveredIssues`（Phase 1 ✅）
- Planner agent 支持增量更新（Phase 2.2）
- 愿景冲突检测 AI（Phase 2.2）
- 多 AI 裁决机制（Phase 2.2，依据 lazypack-discipline §9）
- 解释性说明 skills（eli5 / wait-what / archify，已存在 ✅）
- recv() 人机交互原语（Phase 2.2，ADR-0001 未包含）

**算法**：见 §6.2 中的完整实现示例（包含愿景冲突检测、多 AI 裁决、解释性说明三层机制）

---

## 7. 完整流程图（更新版）

```
用户
  ↓ "我想做登录功能"
  
grill-with-docs (深度访谈)
  ├─ 五维深挖：目标、边界、约束、验收、风险
  └─ 调用 Wayfinder 探索现有代码
  ↓
  
mission.md (彻底的 spec)
  ↓
  
extract-assertions → assertions.json
  ↓
  
split-features → features.json
  ↓
  
check-coverage (开工前硬门禁)
  ├─ 每个断言恰好被一个 Feature 认领
  └─ 不通过则禁止开工
  ↓
  
Orchestrator 启动 Worker (feat-001)
  ↓
  
Worker 执行
  ├─ 在隔离 worktree 中实现
  └─ 产出 handoff.json (含 discoveredIssues)
  ↓
  
Orchestrator 读取 handoff
  ↓
【新增】愿景冲突检测
  ├─ 读取 mission-kickoff.md（初始愿景）
  ├─ 读取 mission.md（当前目标）
  ├─ AI 判断：提议的改动是否与初衷冲突？
  └─ 分类：重大冲突 / 轻微冲突 / 无冲突
  ↓
  
分支处理：
  ├─【无冲突】技术调整
  │   ├─ 缺少依赖 → Planner 增加 Feature → 重新调度
  │   ├─ 架构偏离 → Planner 更新 mission.md → 继续
  │   └─ 无阻塞 → 继续下一个 Feature
  │
  ├─【轻微冲突】多 AI 裁决（如果人不确定）
  │   ├─ 询问用户：自己决定 OR 多 AI 讨论
  │   ├─ 如选多 AI：
  │   │   ├─ 第一轮：3+ AI 独立提案
  │   │   ├─ 第二轮：互评（至少驳一人、认一人）
  │   │   └─ 第三轮：投票 → 多数胜出
  │   ├─ 僵局 → 回到人工裁决
  │   └─ 留档决策过程
  │
  └─【重大冲突】必须人工裁决
      ├─ 解释性说明：
      │   ├─ eli5：简单语言解释问题
      │   ├─ wait-what：质疑提案假设
      │   └─ archify：可视化架构影响
      ├─ 展示冲突分析
      ├─ 用户选择：修改断言 / 增加任务 / 取消 Mission
      └─ 根据决定更新计划
  ↓
  
所有 Feature 完成
  ↓
  
Validator 验证所有 Assertion
  ↓
  
Mission 完成
```

---

## 8. 与现有格式对比

| 特性 | BMAD | Spec Kit | Lazyforeman (本 ADR) |
|------|------|----------|----------------------|
| 断言一等公民 | ❌ Story 里混在一起 | ❌ Criteria 嵌在 spec 里 | ✅ 独立的 assertions.json |
| 开工前硬门禁 | ❌ 没有机制 | ❌ 没有机制 | ✅ 每个 VAL-* 必须被认领 |
| 角色流清晰 | ✅ PRD → Arch → Story | ⚠️ 缺少架构层 | ✅ Mission → Assertions → Features |
| 轻量级 | ❌ 需要多个文档 | ✅ 单一 spec | ✅ 三个文件，结构清晰 |
| 自动化友好 | ⚠️ 需要适配 | ✅ 广泛使用 | ✅ 为 Lazyforeman 量身定制 |
| 前期彻底 | ⚠️ 依赖人工质量 | ⚠️ 依赖人工质量 | ✅ Grill-with-docs 五维深挖 |
| 执行中调整 | ❌ 没有机制 | ❌ 没有机制 | ✅ Orchestrator 读 discoveredIssues |
| 挑战契约 | ❌ 没有机制 | ❌ 没有机制 | ✅ recv() 等待人工裁决 |

---

## 9. 实施计划

### Phase 2.1: 契约层 + Grill（Q1 2027）

1. **Grill-with-docs 增强**
   - 定义五维访谈问题清单
   - 集成 Wayfinder（CodeGraph）
   - mission.md 质量门禁

2. **契约提取与校验**
   - `extract-assertions`（Investigator Agent）
   - `split-features`（Planner Agent）
   - `check-coverage`（开工前硬门禁）

### Phase 2.2: Orchestrator 自适应（Q2 2027）

3. **discoveredIssues 处理器**
   - 读取并分类
   - 路由到不同处理逻辑

4. **动态计划调整**
   - Planner 增量更新
   - 依赖图重建
   - 优先级排序

5. **人工裁决接口**
   - recv() 或等效实现
   - 挑战契约机制

---

## 10. 不做什么（边界）

❌ **不采用 BMAD 或 Spec Kit**：断言账本是核心创新，不应被现有格式约束  
❌ **不把 mission.md 拆成多个文档**：保持单一事实源  
❌ **不让用户手写 assertions.json / features.json**：自动派生  
❌ **不在 Phase 1 实现 Orchestrator 自适应**：依赖 recv()，Phase 2.2 实施

---

## 11. 风险与缓解

### 风险 1：Grill 太耗时

**影响**：用户不愿花时间深度访谈  
**缓解**：
- 提供快速模式（3 维）vs 彻底模式（5 维）
- 对于小需求，允许跳过 Grill 直接写 mission.md

### 风险 2：契约格式不被接受

**影响**：社区更习惯 BMAD 或 Spec Kit  
**缓解**：
- 提供格式转换工具（BMAD → Lazyforeman）
- 在文档中明确说明为什么不选现有格式

### 风险 3：Orchestrator 自适应复杂度高

**影响**：Phase 2.2 实施困难  
**缓解**：
- Phase 2.1 先实现静态契约，证明价值
- 收集真实 discoveredIssues 案例后再设计处理器

---

## 12. 相关文档

- [IDEA-261006-06](../ideas/inbox.md#idea-261006-06)：契约格式二选一（已裁决为 C）
- [IDEA-261006-10](../ideas/inbox.md#idea-261006-10)：Grill-with-docs 深度访谈机制
- [IDEA-261006-11](../ideas/inbox.md#idea-261006-11)：Orchestrator 动态计划调整
- [IDEA-261006-12](../ideas/inbox.md#idea-261006-12)：Worker 挑战契约机制
- [访谈纪要](../interviews/2026-10-06-contract-format-and-orchestrator-design.md)

---

## 13. 批准记录

**决策日期**：2026-10-06  
**批准人**：用户  
**实施负责人**：Claude (Phase 2 规划者)  
**下一步**：Phase 2.1 契约层实施（预计 Q1 2027）
