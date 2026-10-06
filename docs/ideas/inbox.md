# 想法池 (Ideas Inbox)

> 本文件用于留存在需求研讨（如 `/grill-with-docs`）或日常规划中提出、但尚未正式立项为规格票或 ADR 的低承诺探索性想法。
> 
> ### 纪律契约（防基准污染与授权语义）
> 1. **低承诺探索性**：本文件记录的所有想法均为非现行基准（状态为 `exploration`）。严禁 Agent 在未经用户明确指令的情况下，擅自将未采纳的想法当作已批准的工作任务。
> 2. **用户显式授权**：若用户在会话中明确指示"实现某想法"，即构成充分的执行授权，可直接进入实现流程，无需强制补写长规格或 ADR。
> 3. **生命周期流转**：
>    - **采纳与立项 (Adopted)**：经规格吸纳、立项 ADR 或用户授权实施时，注明流转去向（如 `→ 关联至 Issue #X` 或 `→ docs/adr/000X-*.md`），保持原条目可追溯；
>    - **否决与放弃 (Rejected)**：经评估放弃时，记录否决原因并保留在归档区，供历史查阅，避免未来重复讨论；
>    - **协作区保护**：本文件属于人工与 Agent 协作区，不设强制覆盖型托管块，`/lazypack-setup` 重跑时绝不覆盖或清理已有想法。

---

## 1. 活跃想法池 (Active Ideas)

<!-- 条目书写格式示例：
### [IDEA-YYMMDD-01] 简明想法标题
- **提出时间与来源**：YYYY-MM-DD（如：/grill-with-docs 访谈「主题名称」）
- **核心设想与场景**：简述解决什么问题、设想方案是什么
- **未立项原因/权衡**：为什么当时未直接作为现行基准（如：非当期核心链路、成本收益待测）
- **状态**：exploration
-->

### [IDEA-261006-01] 断言覆盖率校验（开工前硬门禁）
- **提出时间与来源**：2026-10-06（立项访谈「mission 模式复刻」，来源 `docs/interviews/2026-10-06-mission-mode-kickoff.md` §2.3）
- **核心设想与场景**：开工前强制校验「每条 VAL-* 断言恰好被一个 feature 认领」，重复认领或无人认领则不许开工。这是 droid mission 最亮眼的设计，也是把"契约"从文档变成可执行约束的那一步。BMAD 与 Spec Kit 均不提供，需原创。
- **未立项原因/权衡**：依赖契约格式先定案（见 IDEA-261006-07）；实现只需数十行校验脚本，但它是决定本项目"只是文档模板"还是"真有约束力"的分水岭，宜与契约格式一并裁决。
- **状态**：exploration

### [IDEA-261006-02] advisor 分阶段开关策略
- **提出时间与来源**：2026-10-06（立项访谈 §4.4 / §8.2）
- **核心设想与场景**：omp 的 advisor 是"每轮旁观"（连续、费钱），droid 的 validator 是"milestone 结束后独立 spawn"（阶段性、省钱）。借助 `--config` 可叠加 overlay，为 dev / qa / plan 各备一份 config，实现"规划与收尾开强 advisor，实现阶段关掉"。
- **未立项原因/权衡**：涉及成本模型，需先确定各阶段模型档位与预算；用户并发低且重视成本，倾向阶段性校验，但尚未实测账单差异。
- **状态**：exploration

### [IDEA-261006-03] 断言两类分流与回填时机
- **提出时间与来源**：2026-10-06（立项访谈 §8.1-3）
- **核心设想与场景**：把断言分为 deterministic（脚本秒级判：文件存在、check 6/6 通过）与 semantic（模型判：内容是否说清楚），分别走不同执行路径与成本档位；并显式定义 pending → passed 的回填时机。
- **未立项原因/权衡**：源于观测到的 droid 缺陷——某 mission 中 feature 已 completed 且 worker 自报通过，对应 10 条断言却长期挂 pending。回填时机不明确会直接复现该问题，故须在编码前定案而非事后补。
- **状态**：exploration

### [IDEA-261006-04] 四类失败分类与「语义错误挂起」判据
- **提出时间与来源**：2026-10-06（立项访谈 §8.2-4）
- **核心设想与场景**：429 限流 → 退避重试；超时 → 延长重试；schema 校验失败 → 换强模型重试；**语义错误（输出合法但内容错）→ 绝不自动重试，转 `recv()` 挂起等人**。在 DBOS step 的异常处理里显式编码这套判据。
- **未立项原因/权衡**：DBOS 默认 retry 不区分这四类，第四类是烧钱黑洞（跑偏的 worker 重试十次，每次都错，账单照付）。须先定义"如何自动识别语义错误"，这本身是个开放问题。
- **状态**：exploration

### [IDEA-261006-05] 断言长期 pending 看门狗
- **提出时间与来源**：2026-10-06（立项访谈 §2.5 / §8.2-5）
- **核心设想与场景**：检测"任务已完成但断言迟迟不落账"类假死，超时后告警或强制人工介入，避免 mission 表面在跑实则卡住。
- **未立项原因/权衡**：依赖 IDEA-261006-03 的回填时机先定案；过早实现可能对正常的长耗时验证误报。
- **状态**：exploration

### [IDEA-261006-06] 契约格式二选一：BMAD vs Spec Kit
- **提出时间与来源**：2026-10-06（立项访谈 §6.2，自议题二悬置至今）
- **核心设想与场景**：BMAD 侧提供 PRD + 架构 + story 交接物，更贴近角色流；Spec Kit 侧提供开箱即用的 spec 为中心格式（130K+ stars，agent 无关）。二者选一，不要都上。
- **未立项原因/权衡**：两者与 mission 的断言账本都不完全对齐，且 BMAD 存在 V6（module ecosystem）与 V4（教程多）的版本分叉。属于难逆转决策，宜单独立 ADR 裁决而非在想法池推进。
- **状态**：exploration

### [IDEA-261006-07] 交互模式：-p 非交互 vs --mode rpc
- **提出时间与来源**：2026-10-06（立项访谈 §6.2）
- **核心设想与场景**：`-p` 简单但 worker 中途无法向用户提问；`--mode rpc` 可做交互式 handoff（对应 droid 的 `returnToOrchestrator` 与人工仲裁），复杂度更高。
- **未立项原因/权衡**：取决于是否接受"worker 跑到一半回头问人"。若产品定位是"说完需求就等成果"，则 `-p` 足够，`recv()` 只用于异常挂起。
- **状态**：exploration

### [IDEA-261006-08] Worker Adapter 可插拔架构
- **提出时间与来源**：2026-10-06（Phase 1 骨架搭建后讨论，源于用户观察：OpenDesign/Orca/Multica 都已有对多种 CLI 的 wrapper）
- **核心设想与场景**：Orchestrator 不绑定 omp，而是通过 `WorkerAdapter` 接口支持多种编程 agent CLI（omp, aider, cursor, multica 等）。直接复用 OpenDesign/Orca/Multica 的成熟 wrapper 层，而非自己重新实现。
- **调研进展**（2 个 workflow 并行）：
  - ✅ **Wrapper 架构调研**（已完成）：分析了 Orca（推荐 fork）、Multica（参考模式）、Open Design CLI（不适合）
  - 🔄 **CLI 扫描能力调研**（进行中）：深度分析 OpenDesign 的 CLI 扫描、模型检测、能力探测实现
- **第一轮调研结论**：
  - **Orca**：推荐 fork 改造（MIT 许可，worktree + SQLite + DAG 与 lazyforeman 高度契合）
  - **Multica**：仅参考模式（架构过重，已知 fallback 和角色扮演问题）
  - **混合策略**：Orca 架构参考 + Multica 隔离模式借鉴 + 原创契约层
- **收益**：
  - 吸收社区成熟轮子，降低维护成本
  - 用户可选最适合的工具（简单任务用 omp，复杂任务用 aider/cursor）
  - 降低对单一工具的依赖风险
- **未立项原因/权衡**：
  - Phase 1 先证明单 worker 闭环可行（omp 足够）
  - 等待第二轮调研结果（CLI 扫描能力如何移植到 TypeScript）
  - Adapter 抽象可在 Phase 1.5 或 Phase 2 引入
- **状态**：exploration（调研进行中）

### [IDEA-261006-09] CLI 动态扫描与模型检测（吸收 OpenDesign 能力）
- **提出时间与来源**：2026-10-06（ADR-0001 决策后讨论，用户明确希望吸收 OpenDesign 的 CLI 扫描能力）
- **核心设想与场景**：实现动态 CLI 注册表，启动时自动扫描 PATH 发现所有可用的编程 agent CLI（aider、cursor、omp、codex 等），检测每个 CLI 使用的模型配置，探测其能力（非交互模式、JSON 输出、MCP 支持），根据任务特征自动选择最合适的 CLI + 模型组合。
- **技术细节**（基于 OpenDesign 实现）：
  - **CLI 扫描**：遍历 PATH，验证 CLI 是否为编程 agent（非同名的其他工具），获取版本信息
  - **模型检测**：读取配置文件（`.aiderrc`、`.cursor/config.json` 等），或调用 CLI 命令查询模型信息
  - **能力探测**：运行测试命令，检测是否支持 `-p`、`--json`、`--mcp` 等参数
  - **动态选择**：根据任务复杂度、是否需要交互、预算等因素，选择最佳 CLI
- **模块设计**：
  ```typescript
  // src/cli-registry/scanner.ts
  export interface CliInfo {
    name: string;           // 'aider' | 'cursor' | 'omp'
    path: string;           // '/usr/local/bin/aider'
    version: string;        // '0.45.1'
    models: string[];       // ['gpt-4', 'claude-3-5-sonnet']
    capabilities: {
      nonInteractive: boolean;
      structuredOutput: boolean;
      mcpSupport: boolean;
    };
  }
  export async function scanAvailableClis(): Promise<CliInfo[]>;
  
  // src/cli-registry/selector.ts
  export function selectBestCli(
    availableClis: CliInfo[],
    task: TaskContext
  ): CliInfo;
  ```
- **调研状态**：
  - 🔄 Workflow 运行中：深度分析 https://github.com/nexu-io/open-design 的实现
  - 调研产出：TypeScript 接口设计、可移植代码清单、集成方案、实施任务列表
- **收益**：
  - 用户无需手动配置，系统自动发现可用 CLI
  - 根据任务特征智能选择最优 CLI（简单任务用快速 CLI，复杂任务用强模型）
  - 降低对单一 CLI 的依赖（一个 CLI 失败可 fallback 到另一个）
  - 透明的模型选择（用户可以看到每个任务用了哪个 CLI + 哪个模型）
- **成本**：
  - 需要维护 CLI 配置文件路径映射（不同 CLI 的配置格式不同）
  - 能力探测需要实际调用 CLI（首次启动会慢一些）
  - 需要处理 CLI 版本升级导致的 API 变化
- **未立项原因/权衡**：
  - Phase 1 先用固定的 omp，证明编排层可行
  - 等待 OpenDesign 调研结果（如何移植到 TypeScript）
  - 可在 Phase 1.5 或 Phase 2 引入（与 Worker Adapter 架构一起）
- **状态**：exploration（调研进行中，workflow ID: wxdl59cdu）

### [IDEA-261006-10] Grill-with-docs 深度访谈机制
- **提出时间与来源**：2026-10-06（契约格式设计访谈 §4，来源 `docs/interviews/2026-10-06-contract-format-and-orchestrator-design.md`）
- **核心设想与场景**：前期 Grill 必须彻底，不是简单问"你要什么"，而是五维深挖：①目标澄清（解决什么问题、谁用、怎么用）；②边界确认（做什么、不做什么、依赖什么）；③技术约束（现有架构、技术债、性能/安全要求）；④验收标准细化（具体怎么验证、自动化还是人工、边界情况）；⑤风险识别（可能出问题的地方、不确定的地方、预先调研的内容）。在 Grill 过程中调用 Wayfinder 探索现有代码，输出高质量的 `mission.md`（包含背景、边界、架构约束、风险）。
- **技术细节**：
  - Grill-with-docs 集成 Wayfinder（如 CodeGraph、`/understand-codebase`）
  - 对话中实时验证用户陈述（"你说后端有 bcrypt"→ 调 Wayfinder 确认）
  - 输出 `mission.md` 包含五个必需章节：背景、目标、边界、架构约束、风险
  - 质量门禁：mission.md 必须明确标注"做什么 ✅"和"不做什么 ❌"
- **收益**：
  - 前期彻底胜过执行中修补（避免 Worker 发现计划错误后返工）
  - 高质量 mission.md 提升后续自动提取断言的准确率
  - 显式的风险识别可预先调研，避免执行中阻塞
- **未立项原因/权衡**：
  - 依赖契约格式先定案（IDEA-261006-06 已选 C：Lazyforeman 自研格式，见 ADR-0003）
  - Grill 深度与耗时成正比，需平衡彻底性与效率
  - Wayfinder 集成需要代码图谱能力（如 CodeGraph `.codegraph/` 索引）
- **状态**：exploration（契约格式已定案，可进入 Phase 2.1 实施）

### [IDEA-261006-11] Orchestrator 动态计划调整
- **提出时间与来源**：2026-10-06（契约格式设计访谈 §5，来源 `docs/interviews/2026-10-06-contract-format-and-orchestrator-design.md`）
- **核心设想与场景**：Orchestrator 读取 Worker handoff 的 `discoveredIssues`，根据问题类型动态调整计划。三种场景：①缺少依赖（blocking）→ 调用 Planner 生成新 Feature，更新依赖图，重新调度；②架构假设错误（non_blocking）→ 调用 Planner 更新 mission.md，继续执行；③挑战契约（blocking + 无法实现）→ 暂停 workflow，调用 recv() 等待用户裁决（修改断言 or 增加任务 or 取消 Mission），根据决定调整后重新调度。
- **技术细节**：
  ```typescript
  // src/orchestrator/issue-handler.ts
  export async function handleDiscoveredIssues(
    handoff: Handoff
  ): Promise<OrchestratorAction> {
    const blocking = handoff.discoveredIssues.filter(
      i => i.severity === 'blocking'
    );
    // 分类：add_feature / update_mission / challenge_contract
  }
  
  // src/orchestrator/plan-updater.ts
  export async function updatePlan(
    action: OrchestratorAction,
    missionDir: string
  ): Promise<void> {
    // 调用 Planner agent 更新 features.json / mission.md
  }
  
  // src/orchestrator/scheduler.ts
  export async function reschedule(missionDir: string): Promise<void> {
    // 重新计算依赖图，找出可执行的 Feature
  }
  ```
- **关键能力**：
  - 读取 `handoff.discoveredIssues` 并分类
  - 动态更新 `features.json` / `mission.md`（增量更新，非全量重写）
  - 重建依赖图（DAG）并按优先级排序
  - 人工裁决接口（recv() 或等效实现）
- **收益**：
  - 避免 Worker 盲目执行错误计划（"任务在执行的时候遇到和 plan 不一致的情况还是硬做那就完蛋了"）
  - 计划可以根据实际情况动态调整，而非一成不变
  - 严重偏离时强制人工介入，避免烧钱
- **未立项原因/权衡**：
  - 依赖 Handoff schema 已定义 `discoveredIssues` 字段（Phase 1 已实现 ✅）
  - 需要 Planner agent 支持增量更新（而非全量重写）
  - recv() 人机交互机制需要 DBOS `ctx.recv()` 或自建等效实现（ADR-0001 自建层未包含此能力）
  - 复杂度高，建议 Phase 2.2 实施
- **状态**：exploration（Phase 1 已有 handoff.discoveredIssues 接口，Phase 2.2 实现处理器）

### [IDEA-261006-12] Worker 挑战契约机制（recv 等待人工裁决）
- **提出时间与来源**：2026-10-06（契约格式设计访谈 §5.2 场景 3，来源 `docs/interviews/2026-10-06-contract-format-and-orchestrator-design.md`）
- **核心设想与场景**：Worker 发现断言无法实现时（如"密码错误时显示提示"，但后端不区分邮箱错误 vs 密码错误），可以在 handoff 中标记 `severity: blocking` + 描述"VAL-002 无法实现"，触发 Orchestrator 暂停 workflow，调用 `recv()` 等待用户裁决。用户可选：①修改断言（降低要求）；②增加新任务（如后端支持详细错误码）；③取消 Mission。裁决后 Orchestrator 更新计划并重新调度。这是"契约可挑战"的具体实现，避免 Worker 盲目执行错误计划。
- **技术细节**：
  ```typescript
  // Worker 产出 handoff
  {
    "discoveredIssues": [
      {
        "severity": "blocking",
        "description": "VAL-002 无法实现：后端不区分邮箱/密码错误",
        "suggestedFix": "修改 VAL-002 或增加后端支持"
      }
    ]
  }
  
  // Orchestrator 处理
  const userDecision = await recv({
    question: `${issue.description}\n\n你想怎么做？`,
    options: ['修改断言', '增加新任务', '取消 Mission']
  });
  ```
- **触发条件**：
  - `severity: 'blocking'`
  - 描述包含"无法实现"或"不可行"关键词
  - Worker 明确标记为需要人工裁决
- **裁决选项**：
  - 修改断言（降低要求或调整验证方式）
  - 增加新任务（修复阻塞问题）
  - 取消 Mission（需求不合理）
- **收益**：
  - Worker 有权挑战不合理的契约
  - 避免盲目执行导致的资源浪费
  - 人机协作：机器执行，人类决策
- **未立项原因/权衡**：
  - 依赖 IDEA-261006-11 的 Orchestrator 动态调整能力
  - 依赖 recv() 人机交互原语（DBOS `ctx.recv()` 或自建等效实现，ADR-0001 封顶条款未包含此能力）
  - 需要定义挑战契约的触发条件（什么算"无法实现"）与裁决选项格式
  - 建议 Phase 2.2 与 Orchestrator 自适应一并实施
### [IDEA-261006-13] 愿景守护机制（防偏离初衷）
- **提出时间与来源**：2026-10-06（契约格式设计访谈补充，来源 `docs/interviews/2026-10-06-contract-format-and-orchestrator-design.md` 追加）
- **核心设想与场景**：在 Orchestrator 执行任何重大调整前（修改断言、改架构、取消 Mission），增加**愿景一致性验证**：①读取初始访谈记录（mission-kickoff.md）和 mission.md（用户核心目标）；②用 AI 判断提议的改动是否与初衷冲突；③分类为重大冲突（必须问人）、轻微冲突（可多 AI 裁决）、无冲突（自动执行）。重大冲突时，调用 eli5（简单语言解释）、wait-what（质疑假设）、archify（可视化影响）辅助人类理解后，由用户最终裁决。
- **技术细节**：
  ```typescript
  // 愿景冲突检测
  const visionCheck = await checkVisionConflict({
    proposedChange: issue.suggestedFix,
    missionDir
  });
  
  if (visionCheck.hasConflict) {
    // 重大冲突 → 解释性说明 + 人工裁决
    const explanations = await explainToHuman(issue, visionCheck);
    return {
      type: 'challenge_contract',
      visionConflict: visionCheck,
      explanations,  // { eli5, critique, diagram }
      requiresHumanDecision: true
    };
  }
  ```
- **冲突判定标准**：
  - 重大冲突：改动违背用户明确表达的目标、边界或核心约束
  - 轻微冲突：调整实现细节，核心目标不变
  - 无冲突：技术调整，不影响愿景
- **多 AI 裁决集成**：轻微冲突且人不确定时，启动 lazypack-discipline §9 多 AI 讨论章程（三轮封顶：独立提案 → 互评 → 投票，僵局交用户裁决）
- **解释性说明工具**：
  - eli5：用简单语言解释技术问题
  - wait-what：质疑提案的隐含假设
  - archify：可视化架构影响（时序图、架构图）
- **收益**：
  - 防止 Orchestrator 自动调整偏离用户初衷
  - 人不知道怎么选时，可借助多 AI 裁决
  - 解释性说明降低理解门槛，提升决策质量
- **未立项原因/权衡**：
  - 依赖 IDEA-261006-11（Orchestrator 动态调整）
  - 依赖 lazypack-discipline §9（多 AI 讨论章程）
  - 需要访谈记录结构化存储（mission-kickoff.md）
  - 需要 eli5 / wait-what / archify 等解释性 skill（已存在 ✅）
  - 建议 Phase 2.2 与 Orchestrator 自适应一并实施
- **状态**：exploration（已纳入 ADR-0003 §6.2，Phase 2.2 实施）

---

## 2. 已采纳与已归档想法 (Promoted / Archived Ideas)

<!-- 流转与归档示例：
- [IDEA-YYMMDD-00] 标题 → 已采纳，关联至 Issue #12 / docs/adr/0002-*.md (YYYY-MM-DD)
- [IDEA-YYMMDD-00] 标题 → 已放弃，原因：评估后发现与既有三方库冲突 (YYYY-MM-DD)
-->

#### 命名方案归档（2026-10-06 立项研讨）

> 最终采纳 `lazyforeman`，依据见 `docs/interviews/2026-10-06-mission-mode-kickoff.md` §6.1。下列备选已放弃，保留原因以避免未来重复讨论。

- `punchlist` → 已放弃，原因：零竞争（GitHub 同名 206 个最大 4★、PyPI 未占）且语义精准，但用户决定改用 `lazy` 前缀以与既有项目成系列 (2026-10-06)
- `baton` → 已放弃，原因：GitHub 同名 1746 个、PyPI 已被占用 (2026-10-06)
- `shakedown` → 已放弃，原因：PyPI 被占，且语义偏"测试"盖不住编排 (2026-10-06)
- `snaglist` → 已放弃，原因：虽最干净（同名仅 18 个）但属英式生僻用法 (2026-10-06)
- `lazymission` → 已放弃，原因：沿用 droid 术语等于替对方定义类目，且未体现自身差异化 (2026-10-06)
- `lazyboss` → 已放弃，原因：GitHub 用户名已被占（同名 12 个）(2026-10-06)
- `takt` → 已放弃，原因：存在 1400★ 同名项目 nrslib/takt（TAKT Agent Koordination Topology），概念直接撞车 (2026-10-06)
- `gauntlet` → 已放弃，原因：1030★ 同名项目 gauntlet-loop 同属 agent 领域 (2026-10-06)
- `foreman`（不带 lazy）→ 已放弃，原因：撞 6163★ ddollar/foreman（Procfile 工具）(2026-10-06)
- `covenant` → 已放弃，原因：4741★ 同名项目为红队 C2 框架，联想负面 (2026-10-06)
- `governor` → 已放弃，原因：语义被限流库占据，易被误认为 rate limit 工具 (2026-10-06)
