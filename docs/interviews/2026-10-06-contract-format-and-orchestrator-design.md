# 契约格式与编排器自适应设计访谈纪要

**日期**：2026-10-06  
**主题**：BMAD vs Spec Kit 契约格式选择、Lazy 契约工作流、Orchestrator 动态调整机制  
**参与者**：用户、Claude (Sonnet 5.5)  
**访谈类型**：技术决策研讨

---

## 1. 背景与触发

### 1.1 前置完成项
- ✅ ADR-0001 已裁决 Phase 1 持久化引擎（自建 SQLite 持久层）
- ✅ Phase 1 实现完成（36 个测试通过，四个门禁全绿）
- ✅ OpenDesign CLI 扫描能力调研启动（IDEA-261006-09）

### 1.2 待决议项
- **IDEA-261006-06**：BMAD vs Spec Kit 契约格式选择
- 断言覆盖率校验机制（IDEA-261006-01）
- 执行中计划调整机制（新议题）

---

## 2. 核心讨论：契约格式选择

### 2.1 问题陈述

**需求**：设计契约格式，描述"用户想要什么"、"系统应该如何表现"、"Worker 需要实现什么"。

**服务对象**：
1. 人类阅读和编写
2. AI Worker 理解和执行
3. Validator 自动验证

### 2.2 候选方案对比

| 维度 | BMAD | Spec Kit | Lazyforeman 契约格式 (方案 C) |
|------|------|----------|------------------------------|
| **断言一等公民** | ❌ Story 里混在一起 | ❌ Acceptance Criteria 嵌在 spec 里 | ✅ 独立的 assertions.json |
| **开工前校验** | ❌ 没有机制 | ❌ 没有机制 | ✅ 每个 VAL-* 必须被认领 |
| **角色流清晰** | ✅ PRD → Arch → Story | ⚠️ 缺少架构层 | ✅ Mission → Assertions → Features |
| **轻量级** | ❌ 需要多个文档 | ✅ 单一 spec | ✅ 三个文件，结构清晰 |
| **自动化友好** | ⚠️ 需要适配 | ✅ 广泛使用 | ✅ 为 Lazyforeman 量身定制 |

### 2.3 核心矛盾

1. **BMAD 和 Spec Kit 都不是为断言账本设计的**
   - BMAD 的 Story 没有"认领断言"机制
   - Spec Kit 的 Acceptance Criteria 嵌在 spec 里，不是独立清单

2. **开工前硬门禁需要显式的断言覆盖率校验**
   - 源于 droid mission 最亮眼的设计
   - 需要断言是一等公民，有独立 ID（VAL-*）
   - 需要 Feature 显式认领：`fulfills: [VAL-001, VAL-002]`

### 2.4 裁决结果

**选择方案 C**：设计 Lazyforeman 自己的契约格式

**理由**：
- 断言账本是核心创新，不应被现有格式约束
- 可以吸收 BMAD 的角色流 + Spec Kit 的轻量感
- 为开工前硬门禁量身定制

---

## 3. 核心设计：Lazy 契约工作流

### 3.1 "Lazy" 的定义

- ✅ 能自动化的绝不手写
- ✅ 能推导的绝不重复记录
- ✅ 能渐进的绝不一次性全写

### 3.2 文件结构

```
.lazyforeman/missions/login-feature/
├── mission.md          # 【人工】高层目标（或对话生成）
├── assertions.json     # 【自动】从 mission.md 提取的断言
├── features.json       # 【自动】Worker 认领后生成
└── progress.json       # 【自动】实时进度
```

**核心原则**：只有 `mission.md` 需要人写（或对话生成），其他全自动。

### 3.3 六阶段工作流

#### 阶段 1：规划（Planner）
**输入**：用户需求（文字描述或对话）  
**输出**：`mission.md`  
**谁做的**：手写或 `/grill-with-docs` 对话生成

```markdown
# Mission: 用户登录功能

## 目标
实现用户登录功能，支持邮箱/密码登录。

## 成功标准
- 用户可以用邮箱和密码登录
- 错误密码时有明确提示
- 登录后跳转到首页

## 架构备注
- 使用 JWT token
- 密码用 bcrypt 哈希
```

#### 阶段 2：提取断言（Investigator Agent）
**输入**：`mission.md`  
**输出**：`assertions.json`（自动生成）

```json
{
  "assertions": [
    {
      "id": "VAL-001",
      "description": "用户可以用邮箱和密码登录",
      "type": "deterministic",
      "status": "pending",
      "claimedBy": null
    }
  ]
}
```

#### 阶段 3：拆分任务（Planner Agent）
**输入**：`mission.md` + `assertions.json`  
**输出**：`features.json`（自动生成）

```json
{
  "features": [
    {
      "id": "feat-001",
      "name": "实现登录表单",
      "fulfills": ["VAL-001", "VAL-002"],
      "preconditions": [],
      "status": "pending"
    }
  ]
}
```

#### 阶段 4：开工前硬门禁
**检查**：每个断言必须被恰好一个 Feature 认领

```typescript
for (const assertion of assertions) {
  const claimers = features.filter(f => 
    f.fulfills.includes(assertion.id)
  );
  if (claimers.length === 0) {
    throw new Error(`断言 ${assertion.id} 无人认领`);
  }
  if (claimers.length > 1) {
    throw new Error(`断言 ${assertion.id} 被多个 Feature 认领`);
  }
}
```

#### 阶段 5：执行（Implementer）
Worker 拿到 Feature，完成后产出 `handoff.json`，系统自动更新 `features.json`。

#### 阶段 6：验证（Validator）
Validator 读取 `assertions.json`，逐个验证并更新状态。

---

## 4. 关键洞察：前期 Grill 要彻底

### 4.1 用户核心诉求

> "前期的 grill 一定要非常彻底，我建议是 grill-with-docs 或者 wayfinder 来做"

### 4.2 Grill-with-docs 的职责

不是简单问"你要什么"，而是：

1. **目标澄清**
   - 这个功能解决什么问题？
   - 谁会用？怎么用？
   - 成功的标准是什么？

2. **边界确认**
   - 哪些在范围内？哪些不做？
   - 依赖哪些现有系统？
   - 有哪些已知的坑？

3. **技术约束**
   - 现有架构是什么样的？
   - 有哪些技术债？
   - 性能/安全有什么要求？

4. **验收标准细化**
   - 每个"成功标准"具体怎么验证？
   - 是自动化测试还是人工检查？
   - 边界情况有哪些？

5. **风险识别**
   - 哪些地方可能出问题？
   - 有哪些不确定的地方？
   - 需要预先调研什么？

### 4.3 Wayfinder 的作用

在 Grill 过程中，如果涉及现有代码：

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
  架构约束：复用 src/auth/hash.ts
```

### 4.4 输出质量

经过彻底 Grill 的 `mission.md` 应包含：

```markdown
## 背景（Grill 产出）
- 当前系统状态
- 用户痛点
- 技术现状

## 边界（Grill 确认）
✅ 做：邮箱密码登录、JWT token
❌ 不做：OAuth、注册（Phase 2）

## 架构约束（Grill 挖掘）
- 后端已有 bcrypt，复用它
- JWT secret 存在 .env
- 前端路由用 React Router v6

## 风险（Grill 识别）
⚠️ bcrypt 版本可能太老（需确认）
⚠️ 不确定现有 API 是否支持 cookie
```

---

## 5. 关键洞察：执行中动态调整

### 5.1 用户核心诉求

> "在具体执行过程中 orchestrator 需要根据其他代理的反馈要能修改任务。不然任务在执行的时候遇到和 plan 不一致的情况还是硬做那就完蛋了"

### 5.2 三种调整场景

#### 场景 1：Worker 发现依赖缺失

```
Worker (feat-001): 实现登录表单
  ↓
Worker: "我需要 /api/v1/login 接口，但它不存在"
  ↓
handoff.discoveredIssues:
  {
    "severity": "blocking",
    "description": "缺少 /api/v1/login 后端接口",
    "suggestedFix": "需要先实现后端接口"
  }
  ↓
Orchestrator:
  调用 Planner 生成新 Feature (feat-002: 后端接口)
  更新 feat-001 依赖: preconditions: ["feat-002"]
  重新调度: feat-002 → feat-001
```

#### 场景 2：Worker 发现架构假设错误

```
Worker (feat-003): 实现 JWT 验证
  ↓
Worker: "mission.md 说用 JWT secret，但代码库用 RSA"
  ↓
handoff.skillFeedback.deviations:
  {
    "step": "生成 JWT",
    "whatIDidInstead": "使用 RSA 私钥签名",
    "why": "保持与现有认证体系一致"
  }
  ↓
Orchestrator:
  调用 Planner 更新 mission.md 架构备注
  继续执行，无需阻塞
```

#### 场景 3：Worker 挑战契约

```
Worker (feat-005): 实现密码错误提示
  ↓
Worker: "VAL-002 无法实现：后端不区分邮箱/密码错误"
  ↓
handoff.discoveredIssues:
  {
    "severity": "blocking",
    "description": "VAL-002 无法实现：后端不区分错误类型",
    "suggestedFix": "修改 VAL-002 或增加后端支持"
  }
  ↓
Orchestrator:
  暂停 workflow
  调用 recv() 等待用户裁决:
    1. 修改 VAL-002（降低要求）
    2. 增加 feat-006（后端支持详细错误码）
  ↓
用户选择 2
  ↓
Planner 生成 feat-006
  重新调度: feat-006 → feat-005
```

### 5.3 Orchestrator 核心能力

1. **读取 discoveredIssues**
   - 分类：blocking / non_blocking / suggestion
   - 路由到不同处理器

2. **动态更新计划**
   - 增加 Feature（缺少依赖）
   - 更新 Mission（架构偏离）
   - 挑战契约（无法实现） → recv()

3. **重新调度**
   - 更新依赖图
   - 优先级排序
   - 自动重试

---

## 6. 完整流程图

```
用户
  ↓ "我想做登录功能"
grill-with-docs (深度访谈)
  ├─ 问目标、边界、约束、风险
  └─ 调用 Wayfinder 探索现有代码
  ↓
mission.md (彻底的 spec)
  ↓
extract-assertions → assertions.json
  ↓
split-features → features.json
  ↓
check-coverage (开工前硬门禁)
  ↓
Orchestrator 启动 Worker (feat-001)
  ↓
Worker 执行
  ├─ 发现问题 → discoveredIssues
  └─ handoff.json
  ↓
Orchestrator 读取 handoff
  ├─ 无阻塞问题 → 继续下一个 Feature
  ├─ 缺少依赖 → Planner 增加 Feature → 重新调度
  ├─ 架构偏离 → Planner 更新 mission.md → 继续
  └─ 挑战契约 → recv() 等待用户裁决 → 调整
  ↓
所有 Feature 完成
  ↓
Validator 验证所有 Assertion
  ↓
Mission 完成
```

---

## 7. 决策与行动项

### 7.1 已确认决策

| 决策点 | 结果 |
|--------|------|
| **契约格式** | 选择方案 C：Lazyforeman 自己的契约格式 |
| **文件结构** | mission.md (人工) + assertions.json (自动) + features.json (自动) |
| **单一事实源** | mission.md 是唯一需要人维护的文件 |
| **前期 Grill** | 必须彻底，使用 grill-with-docs + Wayfinder |
| **执行中调整** | Orchestrator 读取 discoveredIssues 并动态修改计划 |
| **挑战契约机制** | Worker 可以说"这个做不了"，触发 recv() 人工裁决 |

### 7.2 待写入 ADR

**ADR-0003**: Lazyforeman 契约格式与 Lazy 工作流设计

**包含**：
- 契约格式选择（BMAD vs Spec Kit vs 自研）
- 文件结构定义
- Grill-with-docs 职责
- Wayfinder 集成
- Orchestrator 自适应机制
- discoveredIssues 处理流程

### 7.3 想法池更新

追加到 `docs/ideas/inbox.md`：

- **IDEA-261006-10**: Grill-with-docs 深度访谈机制
- **IDEA-261006-11**: Orchestrator 动态计划调整
- **IDEA-261006-12**: Worker 挑战契约机制（recv 等待人工裁决）

### 7.4 Phase 2 实施计划

**Phase 2.1: 契约层 + Grill**
1. Grill-with-docs 增强（定义访谈问题清单）
2. 集成 Wayfinder（探索现有代码）
3. 契约提取与校验（extract-assertions / split-features / check-coverage）

**Phase 2.2: Orchestrator 自适应**
4. discoveredIssues 处理器
5. 动态计划调整（增加 Feature / 更新 Mission / 挑战契约）
6. 重新调度与优先级排序

---

## 8. 关键引用

### 8.1 用户原话

> "前期的 grill 一定要非常彻底，我建议是 grill-with-docs 或者 wayfinder 来做"

> "在具体执行过程中 orchestrator 需要根据其他代理的反馈要能修改任务。不然任务在执行的时候遇到和 plan 不一致的情况还是硬做那就完蛋了"

### 8.2 核心洞察

1. **Lazy 不是偷懒，是智能自动化**
   - 用户只写 mission.md，其他派生产物全自动
   - 能推导的绝不重复记录

2. **前期彻底胜过执行中修补**
   - Grill-with-docs 必须问到底
   - Wayfinder 必须探明现状
   - mission.md 必须包含背景、边界、约束、风险

3. **计划不是一成不变的**
   - Worker 发现问题可以挑战计划
   - Orchestrator 必须能动态调整
   - 严重偏离时必须等待人工裁决

---

## 9. 下一步

1. **立即**：写 ADR-0003（契约格式与 Lazy 工作流）
2. **立即**：更新 `docs/ideas/inbox.md`（3 个新想法）
3. **Phase 2**：实现契约层（extract-assertions / split-features / check-coverage）
4. **Phase 2**：实现 Orchestrator 自适应（discoveredIssues 处理器）
5. **并行**：等待 OpenDesign CLI 扫描调研结果

---

**访谈结束时间**：2026-10-06  
**状态**：✅ 已脱敏、已落档  
**下一访谈**：待定
