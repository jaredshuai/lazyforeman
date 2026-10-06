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
| docs/ideas/inbox.md | 来源材料 | exploration | 团队与规划者 / 讨论产生新想法时 | 规划研讨碎片想法池，非现行基准 |
| docs/interviews/ | 来源材料 | reference | 规划者 / 研讨结束时 | 结构化访谈纪要归档目录 |
| docs/interviews/2026-10-06-mission-mode-kickoff.md | 来源材料 | reference | 规划者 / 研讨结束时 | 立项研讨纪要：droid mission 机制逆向、技术栈定案（omp + DBOS + BMAD）、缺口清单与命名决策；已脱敏本机路径 |
