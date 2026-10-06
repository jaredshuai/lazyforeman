# Lazyforeman 项目上下文

> 状态：`current`（当前唯一的现行有效基准）
> 维护者：项目负责人与规划者
> 更新时机：技术栈变更、架构重大调整、产品定位修正时

---

## 一、产品定位

**一句话定义**：
> 你只需说清需求，后续它自己去做，你直接拿成果。

**核心价值**：
让用户从"需求 → 成果"的全流程中解放出来，mission 系统负责将需求分解为可验收的断言契约、编排多个 worker 并行实现、通过 evidence 驱动验证、自动修复失败项，最终交付经过双轨验证的完整成果。

**目标用户**：
- 独立开发者：需要快速验证想法，但不想陷入重复性实现工作
- 小团队：希望 AI 承担执行层工作，人类聚焦在架构决策与验收
- 夜跑开发者：利用碎片时间提需求，让系统在后台自主完成

**非目标**：
- 不是简单的"AI 写代码"工具（那是 omp 的职责）
- 不是项目管理系统（不处理人类协作的任务分配）
- 不是 CI/CD 平台（虽然会触发验证，但不替代现有 CI）

---

## 二、技术栈（已定案）

基于立项研讨（见 `docs/interviews/2026-10-06-mission-mode-kickoff.md` §4）与深度分析（见 `docs/interviews/2026-10-06-droid-mission-deep-analysis.md`）确定：

### 2.1 执行与路由层：omp (oh-my-pi)

**职责**：
- 调用 LLM（支持 13+ 个 modelRoles，智能路由与 fallback）
- 提供 `-p` 非交互模式（产出确定性 JSON handoff）
- 管理 worktree 隔离（通过 `task` 工具）
- Advisor 分阶段开关（dev 关闭省钱，qa 开启严格）

**关键能力**：
- 模型分层：worker 用便宜模型（Haiku），validator 用强模型（Opus）
- Schema 强制：`-p` 模式保证输出符合 JSON schema
- 成本优化：动态路由 + advisor 可选

### 2.2 编排与状态层：自建 SQLite 持久层 + DBOS 可选升级

**职责**：
- Workflow 编排（串行依赖、并行派发、条件分支）
- 状态持久化（features、assertions、handoffs、progress_log、step_journal）
- 崩溃恢复（step 日志 + 幂等跳过）
- 信号机制（预留 `send()` / `recv()` 实现人工介入）

**关键能力**：
- 原子性：State + Handoff 同步更新
- 可恢复性：从 `step_journal` 恢复已完成 step
- 幂等性：step 执行前检查是否已完成，避免重复

**Phase 1 实现**（ADR-0001）：
- 使用自建 SQLite 持久层（`src/runtime/step-journal.ts` + `src/runtime/workflow-runner.ts`）
- 实现最小 durable execution 语义（step 日志 + 幂等跳过）
- 封顶条款：不实现分布式锁/Saga 补偿/子 workflow/Event sourcing

**可选 DBOS 升级路径**：
- `@dbos-inc/dbos-sdk` 保留为 optionalDependencies
- 提供 Postgres URL 时自动切换到真 DBOS 引擎
- Phase 2+ 按需切换（分布式需求、复杂编排、规模扩展）

**理由**：
- `@dbos-inc/dbos-sdk` 5.x 只支持 Postgres 后端，与 D4「单机零部署」冲突
- Phase 1 目标是「证明可恢复」，而非「证明会用 DBOS」
- 自建层复杂度可控（~200 行），满足本地验证需求
- 详见 `docs/adr/0001-phase1-durable-engine-selection.md`

### 2.3 角色与契约层：BMAD-METHOD (待裁决)

**职责**：
- 定义 12+ 角色（Orchestrator、Worker、Validator、Advisor 等）
- 契约格式（需求规格、验收断言、交付标准）
- Skill 模板（implementation-worker、validation-worker 等）

**悬置议题**（IDEA-261006-06）：
- **选项 A**：采用 BMAD V6（module ecosystem，更贴近角色流）
- **选项 B**：采用 Spec Kit（130K+ stars，agent 无关，社区成熟）
- **决策标准**：哪个与 mission 的断言账本更对齐
- **裁决方式**：单独立 ADR（见下文 ADR 计划）

---

## 三、核心架构（设计原则）

### 3.1 契约先行

**原则**：开工前必须通过断言覆盖率校验

```
features.json 中每个 feature 的 fulfills 数组
  ↓
必须恰好认领 validation-contract.md 中的每条断言
  ↓
孤儿断言或重复认领 → 拒绝启动，recv() 挂起等待人工修正
```

**实现**：`scripts/check_assertion_coverage.py`

### 3.2 Evidence 驱动验证

**原则**：Worker 自报不被信任，必须有证据文件

```
Worker 自报 (handoff.verification.commandsRun)
  ↓
Evidence 文件 (evidence/{feature}/VAL-*.txt)
  ↓
Validator 独立验证 (validation/{feature}/{role}/synthesis.json)
  ↓
更新断言状态 (assertions 表: pending → passed/failed)
```

**实现**：DBOS step 结束时强制校验 evidence 文件存在且非空

### 3.3 自愈机制

**原则**：Worker 可以通过 discoveredIssues 挑战契约

```
Worker 发现契约冲突 (severity: blocking)
  ↓
Orchestrator 读取 discoveredIssues
  ↓
send() 信号暂停，呈现给用户
  ↓
用户裁决（修正契约 or 修改实现）
  ↓
recv() 恢复执行
```

**实现**：Handoff schema 必备字段 `discoveredIssues`

### 3.4 状态机分离

**原则**：Feature 状态与断言状态独立

```
Feature 状态机：pending → in_progress → completed
断言状态机：pending → claimed → passed/failed

Feature 可以 completed，但断言仍为 claimed（等待 validator）
```

**实现**：两个独立的 SQLite 表 + 明确的回填时机（选项 C：Feature 完成后立即触发 validator）

### 3.5 可恢复性

**原则**：任何时刻崩溃都能从断点恢复

```
Progress log (append-only JSONL)
  ↓
State 表记录 lastReviewedHandoffCount
  ↓
Resume 时从未处理的 handoff 继续
  ↓
DBOS 自动 checkpoint 保证不重复不丢失
```

**实现**：DBOS workflow + SQLite `mission_state` 表

---

## 四、关键决策记录（指向 ADRs）

### 已决议（记录在立项研讨）

| 决议编号 | 主题 | 决策 | 依据 |
|---------|------|------|------|
| D1 | 项目命名 | `lazyforeman`（CLI: `foreman`） | 零竞争、语义贴切、lazy 前缀成系列 |
| D2 | 执行引擎 | omp（不用 aider/cursor） | 13 modelRoles、advisor 开关、worktree 隔离 |
| D3 | 编排引擎 | Phase 1 自建 SQLite 持久层，预留 DBOS 升级路径 | 本地可验证、零外部依赖（ADR-0001） |
| D4 | 后端存储 | SQLite（预留 Postgres） | 单机零部署、本地可验证 |
| D5 | 交互模式（初期） | `-p` 非交互 | 简单、确定性输出、Phase 1 足够 |
| D6 | Validator 策略 | 双轨（Scrutiny + User-testing） | 深度 + 广度，避免单点误判 |
| D7 | 留存策略 | hybrid（ideas + minutes） | 想法池 + 结构化纪要，不丢历史 |

### 待裁决（需立 ADR）

| 议题编号 | 主题 | 选项 | 阻塞 Phase | 优先级 |
|---------|------|------|-----------|--------|
| IDEA-261006-06 | 契约格式 | BMAD vs Spec Kit | Phase 2 | High |
| IDEA-261006-07 | 交互模式（后期） | `-p` vs `--mode rpc` | Phase 4 | Medium |
| IDEA-261006-08 | Worker Adapter | 可插拔架构 vs 绑定 omp | Phase 2 | Medium |

**ADR 计划**：
- `docs/adr/0001-phase1-durable-engine-selection.md`（**已完成** 2026-10-06）
- `docs/adr/0002-contract-format-selection.md`（Phase 2 前裁决）
- `docs/adr/0003-interaction-mode-evolution.md`（Phase 4 前裁决）

---

## 五、实现路线图（5 阶段）

详见 `docs/interviews/2026-10-06-droid-mission-deep-analysis.md` §五。

### Phase 1: 地基（✅ 已完成并稳定）

**目标**：单 feature 最小闭环 + 崩溃恢复验证

**关键交付**：
- 自建 SQLite 持久层（`step_journal` 表 + workflow runner）
- 最小 `features.json` + Handoff schema（zod 4.x）
- `createWorktree() → runOmp() → saveHandoff() → cleanupWorktree()`
- 崩溃恢复测试通过（故障注入 + resume 幂等性验证）
- worktree 管理（`.lazyforeman/worktrees/`，失败保留策略）

**技术细节**（ADR-0001）：
- SQLite 表：missions/features/assertions/handoffs/progress_log/step_journal
- Workflow ID 格式：`<type>:<entityId>:<timestamp>`
- 失败 step 重放：success 跳过，failed/started 重新执行
- omp 测试策略：默认 mock，`USE_REAL_OMP=true` opt-in 真实调用
- CLI 暂不提供（Phase 2），验收通过 `pnpm run test`

**实际交付时间**：2026-10-06

### Phase 2.1: 契约层（✅ 已完成）

**目标**：mission.md → assertions.json → features.json 工作流

**关键交付**：
- Mission Parser：解析 mission.md，支持 frontmatter + 结构化验证
- SQLite Schema 扩展：assertions 表新增 5 个字段（type/claimed_by/mission_id/source_index/wayfinder_context），新增 missions_metadata/wayfinder_cache/coverage_validations 表
- Wayfinder Client：codegraph/codebase-memory MCP 工具集成，架构探索与代码搜索
- Investigator Agent：从 mission 提取断言，分类（deterministic/semantic），生成 VAL-* 编号
- Planner Agent：生成 features 并构建依赖 DAG，断言覆盖分配
- Coverage Validator：预工作硬门禁，确保 100% 断言覆盖（无孤儿、无重复认领）
- Mission Workflow：完整编排（parse → investigate → plan → validate → execute）

**测试覆盖**：
- 18 个测试文件
- 155 个测试用例全部通过
- 单元测试 + 集成测试 + 端到端测试

**架构文档**：
- `docs/phase-2.1-architecture.md`：完整架构设计
- `docs/phase-2.1-wayfinder-implementation.md`：Wayfinder 集成实现
- `docs/templates/mission.md`：mission 模板

**实际交付时间**：2026-10-06

### Phase 2.2: Lazy 契约工作流增强（规划中）

**目标**：动态计划调整 + Grill-with-docs 深挖

**关键特性**（基于 ADR-0003）：
- Grill-with-docs 五维深挖（背景/边界/约束/风险/成功标准）
- Worker 契约挑战机制（discoveredIssues → Orchestrator 处理）
- 动态计划调整（新增 feature/移除过时断言/重构依赖 DAG）
- send()/recv() 信号机制（人工介入点）

**预计工作量**：2-3 周

### Phase 3-5

见分析报告详细路线图（并行编排、Advisor 层、生产化）。

---

## 六、开发约定

### 6.1 文件组织

```
lazyforeman/
├── CONTEXT.md                    # 本文件（项目上下文）
├── AGENTS.md                      # Agent 配置入口
├── CODING_STANDARDS.md            # 编码标准
├── RELEASE.md                     # 发版纪律
├── docs/
│   ├── adr/                       # 架构决策记录
│   ├── agents/                    # Agent 角色配置
│   ├── ideas/                     # 探索性想法池
│   ├── interviews/                # 访谈纪要归档
│   └── ARTIFACTS.md               # 产物登记册
├── scripts/                       # 工具脚本
│   └── check_assertion_coverage.py
├── src/                           # 主源码（Phase 1 开始创建）
│   ├── orchestrator/              # DBOS workflows
│   ├── worker/                    # Worker 集成层
│   └── validator/                 # Validator workflows
└── tests/                         # 测试套件
```

### 6.2 提交规范

遵循 `RELEASE.md` 的 Conventional Commits 1.0.0：
- `feat`: 新功能（触发 Minor 升级）
- `fix`: 修复（触发 Patch 升级）
- `docs`: 文档变更（不触发版本）
- `BREAKING CHANGE`: 破坏性改动（触发 Major 升级）

### 6.3 质量门禁

- **执行者与审查者**：都必须运行适用的质量门禁
- **Phase 1**：无编程语言质量门禁（空仓，文档先行）
- **Phase 2+**：根据选择的语言（TypeScript or Python）配置门禁

---

## 七、术语表

| 术语 | 定义 |
|------|------|
| **Mission** | 一次完整的"需求 → 成果"执行流程，包含多个 feature |
| **Feature** | Mission 分解出的单个可独立实现的功能点 |
| **Assertion** | 验收契约中的一条断言（VAL-* 编号） |
| **Handoff** | Worker 完成后产出的交接文档（JSON 格式） |
| **Evidence** | Worker 为每个断言写入的证据文件（VAL-*.txt） |
| **Validator** | 独立验证 evidence 的角色（Scrutiny / User-testing） |
| **Orchestrator** | 编排 mission 的主控制器（DBOS workflow） |
| **Worker** | 执行单个 feature 的角色（通过 omp 调用） |
| **DiscoveredIssues** | Worker 在 handoff 中报告的契约冲突或问题 |
| **Worktree** | Git worktree，每个 feature 在隔离的工作区执行 |

---

## 八、外部参考

- [DBOS Transact 官方文档](https://docs.dbos.dev/)
- [omp (oh-my-pi) GitHub](https://github.com/tmc/omp)
- [BMAD-METHOD](https://github.com/cyanheads/BMAD-METHOD)
- [Spec Kit](https://github.com/*/spec-kit)（假设链接，待确认）
- [Factory Droid](https://github.com/*/factory-droid)（逆向分析来源）

---

**最后更新**：2026-10-06  
**维护者**：项目负责人  
**下次更新时机**：Phase 2.2 启动前（补充 Grill-with-docs 设计与动态计划调整机制）
