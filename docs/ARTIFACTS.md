<!-- lazypack:start block=artifacts-register src=DECISIONS.md@0.4.0 gen=2026-10-06 input=sha256:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5 fp=sha256:e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2 -->
# 产物登记册 (ARTIFACTS)

> 派生自 lazypack-discipline 固定层 DECISIONS.md@0.4.0（依据 lazypack-setup 内置快照编译，来源内容标识: b0bfa054107a9a4c18d8e64a500b4db9bae059bb；离线事实源查阅 lazypack-setup/references/DECISIONS.md）§4。
> 原则：一个东西只有一个家；能推导出来的不手写；有生命周期的写清何时死。

## 1. 产物状态词与流转规则

| 状态词 | 含义 | 流转约束 |
|---|---|---|
| `current` | 当前唯一的现行有效基准 | **在同一主题/用途的权威范围内全局唯一**（不同 feature 规格或多项有效 ADR 可各自主管对应主题的 current）。经明确确认存在替代关系的新产物标为 `current` 时，被替代旧产物方可标记为 `superseded` 并互指；未确认替代关系的不自动假定废弃 |
| `reference` | 外部素材、外部规范、参考设计 | 永久作为参照依据 |
| `exploration` | 探索方案、对比调研 | 仅供比对，不作为实现基准 |
| `superseded` | 已废弃或被取代的旧产物 | 状态变化本身不构成文件移动或删除授权；按材料类型、保留目的、有效引用及四步关卡（确认替代、核查引用、安全封存、登记更新）处理；setup 首期保持原位保留（preserve-existing），不执行自动 `git mv` 物理迁移；登记行同步更新互指新产物 |
| `pipeline` | 由源文件生成的派生品（图标、数据） | 登记源与生成器命令；严禁手工修改派生文件，重新运行 pipeline 生成 |
| `wip` | 正在编写或设计中的未决草案 | 完成后裁决为 `current` 或归档 |

> [!IMPORTANT]
> **未登记产物视为未决**：册上查不到的产物，先向维护者核实，严禁按文件名或创建日期猜测新旧！

## 2. 现存产物登记表

| 产物相对路径 | 类别 | 状态 | 来源/对应票/ADR | 说明 |
|---|---|---|---|---|
| docs/agents/issue-tracker.md | 任务跟踪 | current | lazypack-discipline@0.4.0 | GitHub issue tracker 规范 |
| CODING_STANDARDS.md | 编码规范 | current | lazypack-discipline@0.4.0 | 编码标准与质量门禁要求 |
| RELEASE.md | 发版规范 | current | lazypack-discipline@0.4.0 | 提交规范、版本映射与发版纪律 |
| docs/agents/roles.md | 角色映射 | current | lazypack-discipline@0.4.0 | 六角色职责与 Skill 映射表 |
<!-- lazypack:end block=artifacts-register -->

## 3. 项目自选材料与存量文档登记（非受管协作区）

> 本区由团队与 Agent 协同维护，位于受管托管区外部。遵循保留既有模式（preserve-existing），登记已存在各逻辑区域的实际原件、探索性想法池、访谈纪要归档或外部参考素材。八大逻辑区域（方向、需求与验收、设计与决策、规则与术语、工作与进度、现状与使用说明、验证与观察、来源材料）为逻辑导航，不强制预建八个物理目录。支持 path#anchor 细粒度定位；setup 重跑保持本区已有手工排版与字节不变：

| 产物相对路径 / 锚点 | 逻辑区域 | 状态 | 维护者 / 更新触发 | 来源 / 替代关系 / 依据说明 |
|---|---|---|---|---|
| CONTEXT.md | 方向 | current | 项目负责人 / 技术栈变更或架构重大调整时 | 项目核心上下文：产品定位、技术栈（omp + DBOS + BMAD）、架构原则（契约先行、Evidence 驱动、自愈机制、状态机分离、可恢复性）、5 阶段路线图、术语表 |
| docs/adr/0001-phase1-durable-engine-selection.md | 设计与决策 | current | 项目负责人 / 编排引擎切换时 | ADR：Phase 1 持久化引擎裁决（方案 A：自建 SQLite step journal，DBOS 降为 optionalDependencies）；注意编号与 docs/adr/0001-contract-format-selection.md 冲突，待裁决是否改为 0002 |
| docs/phase-1-implementation-guide-UPDATED.md | 需求与验收 | current | 执行者 / Phase 1 交付时 | 基于 ADR-0001 重写的实现任务书（7 个任务 + 封顶条款）；取代 docs/phase-1-implementation-guide.md |
| docs/phase-1-implementation-guide.md | 需求与验收 | superseded | 规划者 / 已确认替代关系 | 原任务书；「DBOS Transact + SQLite」前提经实测证伪（DBOS 各版本仅支持 Postgres），由 ADR-0001 与 UPDATED 指南替代 |
| docs/adr/0001-contract-format-selection.md | 设计与决策 | wip | 项目负责人 / 调研完成后裁决 | ADR：契约格式选择（BMAD vs Spec Kit vs 自定义），当前状态为 Proposed，阻塞 Phase 2 契约层实现；需完成 Spec Kit 与 BMAD V6 实地调研后裁决 |
| docs/ideas/inbox.md | 来源材料 | exploration | 团队与规划者 / 讨论产生新想法时 | 规划研讨碎片想法池，非现行基准 |
| docs/interviews/ | 来源材料 | reference | 规划者 / 研讨结束时 | 结构化访谈纪要归档目录 |
| docs/interviews/2026-10-06-mission-mode-kickoff.md | 来源材料 | reference | 规划者 / 研讨结束时 | 立项研讨纪要：droid mission 机制逆向、技术栈定案（omp + DBOS + BMAD）、缺口清单与命名决策；已脱敏本机路径 |
| docs/adr/0001-phase1-durable-engine-selection.md | 设计与决策 | current | 规划者 / 技术栈冲突时 | Phase 1 持久化引擎选型：自建 SQLite 持久层（step journal + workflow runner）；DBOS 作为可选升级路径；封顶条款防止功能蔓延 |
| docs/adr/0002-contract-format-selection.md | 设计与决策 | superseded | 规划者 / ADR-0003 替代时 | 契约格式选择（BMAD vs Spec Kit）；编号冲突问题已识别，被 ADR-0003 替代 |
| docs/adr/0003-contract-format-and-lazy-workflow.md | 设计与决策 | current | 规划者 / Phase 2 启动前 | 契约格式与 Lazy 工作流设计：裁决方案 C（自研格式），定义 mission.md/assertions.json/features.json 三层结构，Grill-with-docs 五维深挖机制，Orchestrator 动态计划调整（discoveredIssues 处理）；解决 IDEA-261006-06；为 Phase 2.1/2.2 提供实施蓝图 |
| src/ | 现状与使用说明 | current | 执行者 / 功能完成时 | Phase 1 运行时层实现：自建 step journal + workflow runner；873 行代码（封顶条款已遵守）；36 个测试全通过 |
| test/ | 验证与观察 | current | 执行者 / 功能完成时 | Phase 1 测试套件：崩溃恢复、失败重放、checkpoint 不变量；7 个测试文件，36 个测试用例 |
| docs/interviews/2026-10-06-droid-mission-deep-analysis.md | 来源材料 | reference | 分析团队 / 深度摸排完成时 | 12 个 Agent 全面摸排报告：10 大关键设计模式、5 个反模式、实现缺口清单、分阶段路线图（8-12 周）；基于 mission mis_6a05f5e2 的 288 个文件、89.2 万 tokens 深度分析 |
| docs/interviews/2026-10-06-contract-format-and-orchestrator-design.md | 来源材料 | reference | 规划者 / 研讨结束时 | 契约格式与编排器自适应设计访谈纪要：BMAD vs Spec Kit vs 自研对比，Lazy 契约工作流六阶段，Grill-with-docs 五维深挖，Orchestrator 动态调整三场景，Worker 挑战契约机制；决策 ADR-0003，产出 IDEA-261006-10/11/12 |
| docs/phase-2.1-architecture.md | 设计与决策 | current | 架构设计者 / Phase 2.1 完成时 | Phase 2.1 契约层架构设计：Mission Parser/Investigator/Planner/Coverage Validator 四大模块，Wayfinder 集成，工作流编排，实现计划（10 个任务，92h 估算）；基于 ADR-0003 与 Phase 1 基础设施分析 |
| docs/phase-2.1-wayfinder-implementation.md | 设计与决策 | current | 架构设计者 / Phase 2.1 完成时 | Wayfinder 实现细节：codegraph/codebase-memory MCP 工具调用策略，缓存机制，fallback 模式，工具链编排 |
| docs/templates/mission.md | 规则与术语 | current | 规划者 / Phase 2.1 完成时 | Mission 文档标准模板：frontmatter + Background/Goal/Boundary/Success Criteria/Architecture Constraints/Risks 六大结构化章节；符合 ADR-0003 质量门禁要求 |
| src/mission/parser.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Mission Parser 实现：解析 mission.md（frontmatter + 结构化章节），质量门禁验证，生成 MissionDocument 类型；支持 ADR-0003 模板格式 |
| src/types/mission-document.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | MissionDocument 类型定义：mission.md 解析后的结构化类型，包含 background/goal/boundary/successCriteria/architectureConstraints/risks 字段 |
| src/types/assertion-generator.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Assertion 生成相关类型：AssertionType（deterministic/semantic），AssertionStatus，AssertionInput 等；用于 Investigator Agent |
| src/types/wayfinder.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Wayfinder 类型定义：WayfinderContext（架构快照）、ArchitectureSnapshot、CodePattern 等；用于缓存 codegraph/codebase-memory 探索结果 |
| src/investigator/agent.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Investigator Agent 实现：从 MissionDocument 提取断言，生成 VAL-* 编号，分类（deterministic/semantic），持久化到 SQLite + assertions.json；集成 Wayfinder 架构探索 |
| src/planner/agent.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Planner Agent 实现：根据 mission + assertions 生成 features，构建依赖 DAG，分配断言覆盖（fulfills 数组），持久化到 SQLite + features.json；集成 Wayfinder 代码搜索 |
| src/validator/coverage-validator.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Coverage Validator 实现：预工作硬门禁，验证 100% 断言覆盖（无孤儿、无重复认领），生成结构化错误报告，阻塞不合规计划；符合 ADR-0003 §2.2 契约先行原则 |
| src/wayfinder/client.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Wayfinder Client 实现：codegraph_explore/codebase-memory MCP 工具封装，架构探索，代码搜索，缓存管理（wayfinder_cache 表），fallback 模式 |
| src/workflows/mission.ts | 现状与使用说明 | current | 执行者 / Phase 2.1 完成时 | Mission Workflow 实现：完整契约层编排（parseMission → extractAssertions → generateFeatures → validateCoverage → executeFeatures），集成 Phase 1 singleFeatureWorkflow，崩溃恢复支持 |
| test/mission/parser.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Mission Parser 单元测试：解析有效/无效 mission.md，质量门禁验证，错误处理；14 个测试用例 |
| test/investigator/agent.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Investigator Agent 单元测试：断言提取，VAL-* 编号生成，类型分类，mock Wayfinder；18 个测试用例 |
| test/investigator/integration.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Investigator 集成测试：SQLite 持久化，JSON 文件写入，Wayfinder 缓存；12 个测试用例 |
| test/planner/agent.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Planner Agent 单元测试：feature 生成，DAG 构建，循环检测，fulfills 数组验证；22 个测试用例 |
| test/planner/integration.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Planner 集成测试：SQLite 持久化，JSON 文件写入，DAG 拓扑排序；15 个测试用例 |
| test/validator/coverage-validator.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Coverage Validator 单元测试：孤儿断言检测，重复认领检测，100% 覆盖验证，错误消息格式；16 个测试用例 |
| test/validator/integration.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Coverage Validator 集成测试：SQLite 审计日志，violation 文件写入；8 个测试用例 |
| test/wayfinder/client.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Wayfinder Client 单元测试：架构探索，代码搜索，缓存机制，fallback 模式，mock MCP 工具；20 个测试用例 |
| test/workflows/mission.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Mission Workflow 单元测试：step 幂等性，崩溃恢复，coverage gate 阻塞；18 个测试用例 |
| test/workflows/mission-integration.test.ts | 验证与观察 | current | 执行者 / Phase 2.1 完成时 | Mission Workflow 端到端测试：完整 mission 执行（mission.md → assertions → features → handoffs），DAG 顺序验证，progress_log 正确性；12 个测试用例 |
| docs/phase-2.2-architecture.md | 设计与决策 | current | 架构设计者 / Phase 2.2 完成时 | Phase 2.2 架构设计：Grill Agent 五维深挖、Worker 契约挑战（discoveredIssues）、Orchestrator 动态调整（三场景处理）、send/recv 信号机制、多 AI 裁决（三轮流程）；完整模块设计、数据流、存储设计、测试策略 |
| docs/examples/grill-example.md | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Grill 使用示例：从粗略目标 "实现用户登录功能" 到高质量 mission.md 的完整五维深挖过程；演示目标澄清、边界确认、技术约束（Wayfinder 集成）、验收标准细化、风险识别 |
| src/grill/agent.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Grill Agent 实现：五维深挖机制，Wayfinder 集成，多轮对话管理，生成 mission.md；质量门禁（六大章节、至少 3 条验收标准、明确边界） |
| src/grill/types.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Grill 类型定义：GrillOptions、GrillMessage、GrillSession、GrillDimension（五维深挖） |
| src/discovered-issues/repository.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | DiscoveredIssues 仓储：保存 issues 到 discovered_issues 表，查询（按 feature/severity/category），统计分析 |
| src/discovered-issues/types.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | DiscoveredIssue 类型定义：severity（blocking/major/minor），category（dependency_missing/architecture_conflict/assertion_infeasible/scope_ambiguity/technical_constraint/other），affectedAssertions |
| src/orchestrator/issues-handler.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Issues Handler：读取 handoff.discoveredIssues，调用 IssuesClassifier 分类，决策 action（auto_adjust/pause/ignore），路由到 PlanAdjuster 或 SignalManager |
| src/orchestrator/issues-classifier.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Issues Classifier：按 severity 和 category 分类，决定 action（blocking → auto_adjust/pause，major → auto_adjust，minor → ignore） |
| src/orchestrator/vision-conflict-detector.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Vision Conflict Detector：三级冲突判定（重大/轻微/无冲突），分析 discoveredIssue 与 mission 的关系（核心目标冲突、边界违反、架构约束违反） |
| src/orchestrator/plan-adjuster.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Plan Adjuster：处理三种场景（依赖缺失 → 生成新 feature，架构冲突 → 调用 VisionConflictDetector，断言不可行 → 标记 infeasible），更新 features.json/assertions.json，重新验证覆盖 |
| src/signals/manager.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Signal Manager：send() 暂停 workflow（持久化到 signals 表，抛出 SignalPauseException），recv() 恢复 workflow（等待用户裁决，返回 SignalResolution） |
| src/signals/types.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Signal 类型定义：Signal（type/status/payload），SignalResolution（action: approve/reject/modify，modifications），SignalPayload（feature_id/issue/context） |
| src/adjudication/adjudicator.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | 多 AI 裁决器：三轮流程（独立提案 → 互评 → 修订投票），并行调用 3-5 个 AI 模型，结果判定（consensus/majority/deadlock），自动归档 |
| src/adjudication/types.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | Adjudication 类型定义：AdjudicationContext、AdjudicationOutcome、AdjudicationRound、ParticipantProposal |
| src/adjudication/archive.ts | 现状与使用说明 | current | 执行者 / Phase 2.2 完成时 | 裁决归档器：留档到 .lazyforeman/missions/<mission-name>/decisions/<timestamp>-<issue>/（metadata.json、round-1/2/3.json、outcome.json、README.md） |


