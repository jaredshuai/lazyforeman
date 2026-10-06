# Mission: Phase 2.2 - Lazy 契约工作流增强

## 背景

- Phase 1 已完成 SQLite 持久层加崩溃恢复机制共 36 个测试通过
- Phase 2.1 已完成契约层工作流共 155 个测试通过，包含 Mission Parser 解析 mission.md 并验证质量门禁、Investigator Agent 提取 VAL 断言、Planner Agent 生成 feat 任务、Coverage Validator 执行 100% 覆盖硬门禁、Mission Workflow 实现 6 步端到端编排
- Wayfinder Client 已集成 codegraph 和 codebase-memory MCP 工具
- 当前系统缺乏自愈能力导致契约质量依赖前期完美规划，如果 mission.md 写得不够详细执行中发现问题只能停止
- Worker 无法挑战错误假设，当 Worker 发现契约冲突（依赖缺失、架构假设错误、不可行需求）无处反馈
- Orchestrator 无法动态调整，发现问题后只能人工修改 mission.md 并重新生成整个计划
- 缺乏渐进式探索机制，用户必须在开始前回答所有问题无法边做边调整
- ADR-0003 已设计完整的 Lazy 工作流机制包括 Grill-with-docs、discoveredIssues、动态调整、多 AI 裁决
- Phase 2.1 的 Handoff schema 已预留 discoveredIssues 字段
- 需要实现 Orchestrator 的智能处理逻辑

## 目标

实现 **Lazy 契约工作流增强**，让系统具备自愈能力：用户只需提供粗略目标，Orchestrator 通过 Grill-with-docs 深挖细节，Worker 可以挑战契约，Orchestrator 智能调整计划，最终收敛到高质量交付。

## 边界

✅ 做：Grill-with-docs 深度访谈机制（五维深挖：背景、边界、约束、风险、成功标准，Wayfinder 集成探索现有架构，生成高质量 mission.md）

✅ 做：Worker 契约挑战机制（Handoff schema 扩展 discoveredIssues 字段结构化，Orchestrator 读取并分类 issues 为 blocking/non-blocking，持久化到 SQLite discovered_issues 表）

✅ 做：Orchestrator 动态调整（愿景冲突检测分为重大/轻微/无冲突三级，场景1依赖缺失自动生成新 feature，场景2架构假设错误触发多 AI 裁决或人工介入，场景3断言不可行修正契约并重新验证覆盖）

✅ 做：send/recv 信号机制（send 暂停工作流呈现问题给用户，recv 接收用户裁决后恢复执行，信号日志存储到 signals 表）

✅ 做：多 AI 讨论章程（基于 lazypack-discipline §9 的三轮裁决机制，独立提案到互评到修订投票，留档到 .lazyforeman/missions/mission-name/decisions 目录）

❌ 不做：并行编排（Phase 3 才实现 DAG 调度器、并行派发多个 features、资源池管理）

❌ 不做：里程碑验证（Phase 4 才实现 Scrutiny Validator 深度验证和 User-testing Validator 广度验证的双轨制交叉验证）

❌ 不做：CLI 命令（Phase 5 才实现 foreman mission grill 和 foreman mission adjust 命令）

❌ 不做：复杂 UI/UX（Phase 2.2 使用命令行对话，不提供交互式 Grill 界面和可视化调整面板）

## 成功标准

- [ ] **VAL-2.2-001**: Grill Agent 可以从粗略目标生成符合 ADR-0003 模板的 mission.md（包含五维内容：背景、目标、边界、成功标准、架构约束、风险）
- [ ] **VAL-2.2-002**: Grill 过程中调用 Wayfinder 探索现有架构，并将发现写入 mission.md 的"架构约束"章节
- [ ] **VAL-2.2-003**: Worker 可以在 handoff 中报告 discoveredIssues（包含 severity、description、suggestedFix 字段）
- [ ] **VAL-2.2-004**: Orchestrator 可以读取 discoveredIssues 并正确分类（blocking/warning/info）
- [ ] **VAL-2.2-005**: Orchestrator 可以检测愿景冲突（读取初始访谈记录 + mission.md，用 AI 判断冲突等级）
- [ ] **VAL-2.2-006**: 场景 1（依赖缺失）：Orchestrator 自动生成新 feature，更新 preconditions，重新调度
- [ ] **VAL-2.2-007**: 场景 2（架构假设错误）：Orchestrator 触发 send() 信号，等待用户裁决
- [ ] **VAL-2.2-008**: 场景 3（断言不可行）：Orchestrator 修正 assertions.json，更新 features.json，重新验证覆盖
- [ ] **VAL-2.2-009**: send() 信号可以暂停工作流，持久化到 SQLite（signals 表，状态 pending）
- [ ] **VAL-2.2-010**: recv() 信号可以恢复工作流，更新信号状态（resolved），记录用户裁决
- [ ] **VAL-2.2-011**: 多 AI 裁决机制可以执行三轮流程（独立提案到互评到修订投票），输出胜出方案
- [ ] **VAL-2.2-012**: 所有裁决过程留档到 .lazyforeman/missions/mission-name/decisions/timestamp-issue 目录
- [ ] **VAL-2.2-013**: 所有新增模块有 80%以上单元测试覆盖率
- [ ] **VAL-2.2-014**: 至少 2 个端到端集成测试（完整 Grill 到执行到 discoveredIssues 到动态调整到恢复）
- [ ] **VAL-2.2-015**: 崩溃恢复测试：在 Grill、愿景检测、多 AI 裁决各阶段注入崩溃，验证可恢复
- [ ] **VAL-2.2-016**: 所有代码通过 TypeScript strict 检查、Biome 格式化、无 ESLint 错误
- [ ] **VAL-2.2-017**: 更新 CONTEXT.md 标记 Phase 2.2 完成状态
- [ ] **VAL-2.2-018**: 更新 docs/ARTIFACTS.md 登记所有新增产物
- [ ] **VAL-2.2-019**: 创建 docs/phase-2.2-architecture.md 说明 Grill、动态调整、信号机制的设计
- [ ] **VAL-2.2-020**: 创建示例 mission（docs/examples/grill-example.md）演示 Grill 输出

## 架构约束

- Phase 1 持久层可复用：src/runtime/step-journal.ts 的 Step 日志机制用于 Grill 和调整流程的崩溃恢复，src/runtime/workflow-runner.ts 的 Workflow 执行器用于编排 Grill 和调整流程
- Phase 2.1 契约层可复用：src/mission/parser.ts 解析 Grill 生成的 mission.md，src/investigator/agent.ts 从修正后的 mission.md 重新提取断言，src/planner/agent.ts 动态生成新 features，src/validator/coverage-validator.ts 修正后重新验证覆盖，src/wayfinder/client.ts 在 Grill 过程中探索架构
- SQLite 表扩展：handoffs 表新增 discovered_issues_json 列，新增 signals 表存储 send/recv 信号，新增 decisions 表存储多 AI 裁决历史，新增 grill_sessions 表存储 Grill 对话历史
- 技术栈要求：TypeScript 5.x 与 Phase 1/2.1 一致，Vitest 测试框架与 Phase 1/2.1 一致，Zod 4.x Schema 验证与 Phase 1/2.1 一致，通过 omp 调用 LLM 支持 modelRoles 路由与 Phase 1/2.1 一致，MCP 工具 codegraph 和 codebase-memory 已通过 Wayfinder 集成
- 性能约束：Grill 对话轮次上限最多 10 轮防止无限循环，多 AI 裁决参与者数量 3 到 5 个不超过 5 个控制成本，信号超时 send 后 24 小时无 recv 则自动标记为 abandoned，决策留档大小限制单个决策目录小于 10MB 压缩存储

## 风险

⚠️ 风险1 Grill质量难以量化：如何判断 Grill 是否足够彻底可能导致 Grill 过度浪费时间或不足执行中频繁返工，影响用户体验和系统可信度，缓解措施包括定义明确的 Grill 完成标准（五维各至少3个要点、架构约束包含 Wayfinder 发现）、提供示例 mission.md 作为质量基准、Phase 2.2 先实现机制 Phase 3 根据实测数据优化启发式规则

⚠️ 风险2 愿景冲突检测误判：AI 判断冲突等级可能不准确将重大冲突误判为轻微冲突导致自动执行错误决策违背用户意图产生不可接受的交付，缓解措施包括采用保守策略有疑问时优先标记为重大冲突交给用户裁决、提供 strict-vision-check 模式所有冲突都需人工确认、留档所有冲突检测过程用户可追溯和纠正

⚠️ 风险3 多AI裁决可能僵局：三轮流程后仍无多数方案导致流程卡死无法自动收敛浪费计算资源，缓解措施包括僵局时自动回退到人工裁决 send 信号、限制裁决轮次最多3轮每轮最多5分钟、提供降级方案简化到2个 AI 对比

⚠️ 风险4 动态调整可能破坏现有工作：修正契约可能导致已完成的 features 失效断言被删除或依赖关系改变，返工成本高进度倒退，缓解措施包括调整前进行影响分析检查哪些 features 会受影响、提供回滚机制保存调整前的快照到 snapshots 表、明确回滚规则如果影响超过30%已完成 features 必须人工确认

⚠️ 风险5 omp模型成本控制：Grill 和多 AI 裁决会产生大量 LLM 调用可能导致成本失控用户账单超预期，预先调研计划包括 Phase 2.2 实现前测算典型 Grill 场景的 token 消耗、设计成本上限机制 max-cost 参数、提供 mock 模式测试时不调用真实 LLM
