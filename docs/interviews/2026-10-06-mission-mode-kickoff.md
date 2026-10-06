# 访谈纪要：mission 模式复刻 · 立项研讨

> 状态：`reference`（来源材料，永久作为参照依据，不作为实现基准）
> 逻辑区域：来源材料
> 归档目录：`docs/interviews/`（依据 `docs/agents/roles.md` §3 hybrid 留存模式）

| 项 | 内容 |
|---|---|
| 日期 | 2026-10-06 |
| 研讨方式 | 对话式追问（用户提问驱动，逐层收敛） |
| 参与者 | 仓库维护者、规划者（AI） |
| 主题 | 复刻 Factory Droid 的 mission 模式，并做得更好 |
| 立项产出 | 项目命名 `lazyforeman`、技术栈定案、缺口清单 |
| 相关材料 | `docs/ideas/inbox.md`（本次提炼的未立项构想） |

---

## 0. 摘要（TL;DR）

本次研讨回答了五个递进的问题：droid 的 mission 模式是怎么实现的 → 复刻该用什么开源项目 → 用户已有工具链能覆盖多少 → 状态机/编排层选谁 → 还缺什么。

**核心结论**：mission 模式的本质是一套**文件协议约定**，不是框架能力。用户已有的 omp 覆盖了执行、路由、worker 隔离与会话接续；缺的是**任务级编排**，由 DBOS Transact（SQLite 后端）补齐；角色层借 BMAD-METHOD；真正的原创工作量集中在 omp 与 DBOS 之间的**胶水层**。

**一句话产品定义**（已确立）：

> 你只需说清需求，后续它自己去做，你直接拿成果。

---

## 1. 访谈背景与起点

起点是一个具体问题：「你能看到 factory droid 在干什么吗」。由此发现 droid 把全部 mission 状态落盘在本地，进而追问能否反推其机制实现、能否复刻、用什么开源方案。

研讨呈链式展开，每一轮的结论成为下一轮的约束：

```
droid 在做什么
  → 能否反推 mission 模式的实现机制
    → 复刻该用什么开源项目（不想重复造轮子）
      → 约束澄清：多模型路由 / 低并发 / 角色丰富 / omp 用户
        → 技术栈是否定了
          → 任务接续 omp 是否已胜任
            → 状态机有什么库能参考
              → 拍板 DBOS，还缺什么拼图
                → 项目命名
```

---

## 2. 议题一：droid mission 机制的逆向还原

### 2.1 核心设计

一句话概括：**契约先行，worker 用完即毁，文件即真相源**。

### 2.2 两阶段结构

**阶段一：规划（orchestrator 与用户对话，产出"法律文件"）**

产物顺序：`mission.md` → `architecture.md` → `validation-contract.md`（VAL-* 断言）→ `validation-state.json` → `features.json`

**阶段二：执行（spawn-仲裁循环）**

取 `features.json` 首个 pending → spawn 独立 worker session → 读 mission 文件 + 按 skill 干活 → 改仓库并 git commit → 写 handoff JSON → session 销毁。

### 2.3 五个关键设计点

1. **mission 级 TDD**：先写"什么叫做完"（数十条 VAL-* 断言），再倒推拆哪些 feature。开工前强制校验**每条断言被恰好一个 feature 认领**——日志原话：`Coverage check passed: all 40 validation contract assertions are claimed by exactly one feature.` 重复认领或无人认领则不许开工。
2. **worker skill 是 orchestrator 现场生成的**（`skills/<role>-worker/SKILL.md`），不是预置的。先"设计造它的工人"，再让工人干活。
3. **handoff 是唯一记忆载体**：固定 schema（`salientSummary` / `whatWasImplemented` / `whatWasLeftUndone` / `verification.commandsRun` / `tests` / `discoveredIssues`）。orchestrator 只看这个 JSON，不继承 worker 上下文——这是规避 lost-in-the-middle 的手段。
4. **会自愈**：worker 上报"契约里这两条断言写错了"，orchestrator 拿回控制权后直接改契约再 resume。契约不是死的，是被执行过程反向修正的（观测到的 mission resume 了 17 次）。
5. **模型分层**：worker 用便宜快模型，validator 用强模型 + 高推理强度。钱花在验收上。

### 2.4 验收双层制

milestone 收尾触发 `milestone_validation_triggered` → `scrutiny-validator`（挑刺）→ `user-testing-validator`（按契约逐条走真实流程）→ 通过的断言写回 `validation-state.json`。

### 2.5 顺带发现的两个事实

- **mission 目录可复用**：同一目录里最早的 `mission_accepted` 是另一个 issue 号，数小时后又出现新的。说明 mission 可被重新规划、改标题继续跑，目录不重建。
- **断言账本可能回填滞后**：观测到一个 mission 中 TS feature 已 `completed` 且 worker 自报 `validatorsPassed: true`，但 `validation-state.json` 里对应 10 条断言仍为 pending。疑为留到 cross-validation 阶段统一落账，也可能是回填 bug。**这条是本项目的设计警示：pending → passed 的时机必须显式设计。**

---

## 3. 议题二：复刻选型（"不想重复造轮子"）

### 3.1 首要判断

别找"全能框架"。Droid 的 orchestrator 提示词里**没用任何 agent 框架**——就是读文件、派活、收 handoff。框架只能帮你解决两件事：**checkpoint/断点续做** 与 **并发调度**。剩下的都是协议设计。

### 3.2 2026-10 生态现状（已核实）

| 项目 | 定位 | 处置 |
|---|---|---|
| LangGraph 1.x | AI 编排事实标准，34.5M 月下载 | 不选（与 omp 职责重叠，且倾向自管 LLM 调用） |
| GitHub Spec Kit | Spec → Plan → Tasks → Implement → Converge，130K+ stars | 悬置（见 §6.2） |
| OpenHands | Event Stream 持久化 + 原生 Resume，支持多 backend | 不选（云端路线，与本地轻量定位不符） |
| Claude Agent SDK | 5 层 subagent、dynamic workflows | 不选（绑 Claude，与多 provider 现状冲突） |
| CrewAI | 角色-任务-团队抽象，上手最快 | 不选（无内置 checkpoint，token 消耗可达 3 倍） |
| AutoGen | — | 已转维护模式，继任者 Microsoft Agent Framework 1.0 |
| OpenAI Swarm | — | 已归档 |
| Temporal | 分布式 durable execution 标杆 | 不选（需 server + Cassandra，运维重） |

### 3.3 用户约束澄清（本轮改变结论）

用户明确三点：**模型来源多、要智能路由**；**并发需求不高**；**希望角色丰富**。且用户是 **omp（oh-my-pi）用户**。

**由此反转了一个前提**：原本以为用户缺"智能路由能力"，实际检查发现 omp 已具备，且强于 droid。

---

## 4. 议题三：omp 现有能力盘点

### 4.1 omp 已覆盖（实测本机配置）

- **13 个 modelRoles** 槽位（对比 droid 只有 2 个写死槽位）
- `task.agentModelOverrides`：按子 agent 单独覆盖模型
- `retry.fallbackChains`：多级自动降级链
- `advisor` 角色：第二模型旁观并注入 aside/concern/blocker
- `memory.backend: mnemopi` 持久记忆；`autolearn` 已开
- `task` 工具：fan-out 到隔离 git worktree 的子 agent，返回经 schema 校验的结构化结果

用户凭直觉已把 `task` 配成便宜快模型、`advisor` 配成强模型——**与 droid 的"worker 便宜、validator 强"是同一判断**。

### 4.2 会话级接续：omp 已做完（CLI 原生）

| 能力 | 实测证据 |
|---|---|
| 会话恢复 | `omp -c/--continue`；`omp -r/--resume <id前缀\|path\|picker>` |
| 完整落盘 | `~/.omp/agent/sessions/<cwd>/<时间戳>_<uuid>.jsonl`，工具输出存 `N.bash.log` |
| 自动摘要 | `session_recaps` 表，含 commit hash + 下一步 |
| 长期记忆 | mnemopi 按项目分 bank |
| 程序化驱动 | `--mode json\|rpc\|rpc-ui`、`-p/--print` |
| 看门狗 | `--max-time` |
| 内置工具 | `task`（子 agent 并行）、`todo`（任务列表）、`ask`（仅交互） |

**关键洞察**：omp 的 `session_recaps` 与 droid 的 handoff 是**同构的**（「做了什么 + commit + 下一步」），差别仅在粒度——omp 是 per-session，droid 是 per-worker。实测证据节选：

> Session fixed the KeepFresh reminder quota bug by migrating to Calendar Kit plus the notification permission loop, committed as be02363 and pushed to origin/main. Next: verify the daily calendar reminder fires at 9:00 tomorrow.

### 4.3 任务级编排：omp 一块都没有

实测两个数据库：`agent.db` 20 张表清一色 auth/credentials/usage/model_perf/cache；`history.db` 仅 history / session_recaps / session_titles。**全库无任何 tasks / features / assertions 表。**

三个具体缺口：

1. **`todo` 工具不跨会话**——grep 到它只写在单个 session 的 jsonl 内，会话结束即失效
2. **recap 是自由文本，程序读不了**——无法对其做 `if all(status == 'completed')` 这类判定
3. **`task` 是并行 fan-out，不表达依赖**

### 4.4 关键新发现：角色 overlay

`--config <file>` 是**可重复叠加的 overlay**。这意味着可为每个角色准备独立 config（如 `dev.yml` 关 advisor 省钱、`qa.yml` 开强 advisor），用一条 flag 解决"advisor 何时开关"的问题，无需改动 omp 本身。

---

## 5. 议题四：状态机与编排层选型

### 5.1 三档对比

| 档位 | 候选 | 代价 | 适用 |
|---|---|---|---|
| 极轻 | `python-statemachine` v3.2.1（零依赖，1.3M 月下载） | 只管状态语义，持久化自写 | 6 个 feature 量级 |
| **推荐** | **DBOS Transact** | 装饰器搞定 | 要真崩溃恢复 |
| 重 | Temporal / Restate / Cadence / Prefect | 要运维一个 server | 跑数天数周、多语言 |

### 5.2 选定 DBOS Transact 的理由

- **是库不是服务**：无 orchestrator server、无 Cassandra、无 worker 集群
- **支持 SQLite**（`sqlite:///path`；Python / Go v0.16+ / Java v0.9 均已支持）→ 单机无需 Postgres
- `@workflow` / `@step` 装饰器自动 checkpoint，崩溃从最后 checkpoint 恢复
- **SQL 直接查/暂停/取消/fork workflow** —— 断言账本可直接 `SELECT`
- `send()` / `recv()` 信号支持人工介入，对应 droid 的「回改契约再 resume」
- 内置 durable queue 提供顺序保证
- step 延迟亚 2ms；2026-06 新增 durable streams LISTEN/NOTIFY 优化（明确面向 LLM 场景）

**SQLite 后端限制**（已评估，对本项目可接受）：无 LISTEN/NOTIFY 改轮询；Python <3.12 时间戳精度较低；单写者。若将来需多 worker 并行写同一 mission，换 Postgres 只改连接串，DBOS 层不动。

### 5.3 mission 构件 → DBOS 映射

| mission 概念 | DBOS 对应 |
|---|---|
| 一个 feature | 一个 `@DBOS.workflow()` |
| 一次 worker 调用 | 一个 `@DBOS.step()` |
| handoff 仲裁 / 回改契约 | `DBOS.recv()` 挂起 + `send()` 唤醒 |
| `features.json` 状态 | workflow 状态表，可 SQL 查询 |
| 依赖顺序 | 拓扑排序 + durable queue，不靠并发 |

---

## 6. 议题五：命名与悬置项

### 6.1 命名决策

用户先考虑通用名，最终要求 **`lazy` 开头**（与既有项目 `lazypack-discipline` 成系列），并明确产品定位是"比 droid mission 更好的同类体验"。

**实测占用情况**（2026-10-06）：

| 名字 | GitHub 用户名 | 同名仓库数 | PyPI |
|---|---|---|---|
| **lazyforeman** | 404 可用 | **0** | 404 |
| lazybrief | 404 可用 | 0 | 404 |
| lazymission | 404 可用 | 0 | 404 |
| lazyboss | 200 被占 | 12 | 404 |
| lazycrew / lazyship | 200 被占 | 2 | — |

（另测 22 个单字名作为 GitHub 用户名**全部被占**：baton / foreman / charter / writ / brief / relay / covenant / mandate / governor / assay / gauntlet / crucible / compact / steward / quartermaster / gig / stint / shift / escrow / indent / indenture / livery。）

**决策：`lazyforeman`**。理由：

1. 零竞争（GitHub 同名 0 个、用户名与 PyPI 均可用）
2. 构词法与 `lazypack-discipline` 一致（lazy + 职业名词）
3. **foreman（工头）精准对应 orchestrator**：自己不动手，只派活、盯进度、验收签字
4. 不采用 `mission` — 不站在 droid 的词底下定义这个类目

CLI 建议名 `foreman`；tagline 建议 *You brief it. It runs the crew. You collect the work.*

### 6.2 仍悬置

- **契约格式**：BMAD-METHOD 的 PRD/架构/story vs Spec Kit 的 spec 为中心，二选一（不要都上）
- **BMAD 版本**：V6（module ecosystem）vs V4（稳定、教程多）——网上教程多为 V4，落地前需确认
- **交互模式**：`-p` 非交互（简单，但 worker 中途无法提问）vs `--mode rpc`（可做交互式 handoff，复杂度高）

---

## 7. 已决议清单

| # | 决议 | 依据 |
|---|---|---|
| D1 | 执行与路由层不换，继续用 omp | 已覆盖 13 modelRoles、fallbackChains、worktree 隔离、mnemopi |
| D2 | 编排层用 DBOS Transact + SQLite | 库非服务；支持 SQLite；SQL 可查状态；信号支持人工介入 |
| D3 | 角色层借 BMAD-METHOD | 12+ 角色 / 34+ 工作流，纯 Markdown+YAML，模型无关 |
| D4 | 项目名 `lazyforeman`，CLI `foreman` | 零竞争 + 语义精准 + 与既有项目成系列 |
| D5 | 不引入 LangGraph / Claude Agent SDK / CrewAI / Temporal | 分别因职责重叠、模型锁定、无 checkpoint、运维过重 |
| D6 | 断言覆盖率校验需自建 | droid 最亮眼的设计，BMAD 与 Spec Kit 均无 |
| D7 | 断言分 deterministic / semantic 两类处理 | 见 §8.2 |

---

## 8. 缺口清单（胶水层）

### 8.1 三块硬缺口（不补跑不起来）

1. **handoff 契约**：omp 子 agent 的返回格式是它自己定的，不是本项目契约。需自定义 schema 并保证 worker 必产出——`--mode rpc` 强制优于 prompt 约束；DBOS step 返回后应校验文件存在且过 schema，缺失即判失败。
2. **worktree 生命周期**：**omp 的 git worktree 隔离是 `task` 工具的能力，不是 `omp -p` 的**。用 `-p` 就得自己建 worktree 再 `--cwd` 指过去。谁建 / 命名 / 何时合回 / 冲突怎么办 / feature 失败怎么回滚，全未定。
   - 附加：**step 重试前的文件系统是脏的**，重跑前需 `git checkout` 复位，DBOS 不管这个。
3. **断言分两类与回填时机**：deterministic（脚本秒级判：文件存在、check 6/6 通过）vs semantic（模型判：文档是否说清分层节奏）。且必须显式设计 pending → passed 的时机，否则重蹈 §2.5 的覆辙。

### 8.2 两处会烧钱或失控的默认值

4. **重试 vs 挂起的判据**：429 限流 → 退避重试；超时 → 延长重试；schema 校验失败 → 换强模型重试；**语义错误（输出合法但内容错）绝不能自动重试，必须 `recv()` 挂起等人**。DBOS 默认 retry 不区分这四类，第四类是烧钱黑洞。
5. **护栏**：step 需 `max_attempts`；omp `--max-time`（卡单次 worker）与 DBOS timeout（卡整个 feature）要分工；需 watchdog 检测"断言长期 pending"类假死。

### 8.3 DBOS 自身的约束

6. **决定性约束**：workflow 骨架（拓扑排序、选下一个 pending feature）必须是纯函数——不读时钟、不随机、不做 IO。所有非确定性操作（调 omp、读文件、让模型判断）必须进 `@step`，写在 workflow 里直接调模型会破坏重放。

### 8.4 体验缺口

7. **人工介入界面**：`recv()` 需要有人发信号。开源版是否带 admin server、还是自写 SQL 查询脚本，未确认。

---

## 9. 下一步建议（未授权执行）

研讨结论：**先补胶水，别先写角色**。角色层与契约层可后加，而 worktree + handoff 是地基，改起来要动所有东西。

建议的第一个里程碑是**单 feature 最小闭环**：

```
一个 feature → 一个 worktree → 一次 omp -p 调用
  → 一个 handoff 文件（过 schema 校验）
  → DBOS step 兜住重试与崩溃恢复
```

---

## 附录 A：观测证据索引（已脱敏）

> 依据 `roles.md` §3 Step 1 脱敏要求，本机用户名与绝对路径已泛化；无 API 密钥与凭据内容。

| 证据 | 位置（脱敏） | 说明 |
|---|---|---|
| droid 进程 | `droid.exe daemon --listen ipc` | 观测时已运行约 7.5 小时 |
| mission 状态目录 | `~/.factory/missions/<mission-uuid>/` | 含 mission.md / architecture.md / validation-contract.md / validation-state.json / features.json / AGENTS.md / init.sh / services.yaml |
| 事件流 | 同目录 `progress_log.jsonl` | append-only；类型含 mission_accepted / mission_run_started / worker_selected_feature / worker_started / worker_completed / handoff_items_dismissed / milestone_validation_triggered |
| 交接件 | 同目录 `handoffs/*.json` | 固定 schema |
| 动态 skill | 同目录 `skills/<role>-worker/SKILL.md` | orchestrator 现场生成 |
| orchestrator 提示词 | 内置于 droid 二进制 | 可 grep 到 `mission-worker-base`、`scrutiny-validator`、`user-testing-validator` 等常量 |
| omp 配置 | `~/.omp/agent/config.yml` | 13 个 modelRoles、fallbackChains、mnemopi |
| omp 会话库 | `~/.omp/agent/sessions/` | 按 cwd 分目录的 jsonl |
| omp 摘要表 | `~/.omp/agent/history.db` → `session_recaps` | 实测 11 条 |
| omp 长期记忆 | `~/.omp/agent/memories/mnemopi/banks/<project>/` | 按项目分 bank |
| omp CLI 能力 | `omp --help` | 见 §4.2 |

## 附录 B：术语表

| 术语 | 含义 |
|---|---|
| mission | 一次完整任务：规划 → 拆 feature → 逐个执行 → 交叉验收 |
| orchestrator / foreman | 编排者。自己不干活，派活、盯进度、验收 |
| worker | 被派出去干单个 feature 的 agent 实例，用完即毁 |
| handoff | worker 干完交回的结构化交接件，是唯一记忆载体 |
| validation contract | 验收契约，开工前定义"什么叫做完" |
| 断言账本 | 每条 VAL-* 断言的 pending / passed 状态记录 |
| feature | mission 拆出的子任务，各自认领若干断言 |
| punch list | 建筑行业术语：完工后列的瑕疵清单，整改完才签字验收。本项目命名来源 |
| deterministic 断言 | 可由脚本判定的断言（文件存在、命令退出码等） |
| semantic 断言 | 需模型判断的断言（内容是否说清楚等） |
| single-context | 本仓库的文档布局：`CONTEXT.md` + `docs/adr/` 位于根目录 |
