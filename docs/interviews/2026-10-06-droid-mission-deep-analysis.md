# Droid Mission 机制深度分析报告

> 状态：`reference`（来源材料，永久作为参照依据，不作为实现基准）
> 逻辑区域：来源材料
> 归档目录：`docs/interviews/`（依据 `docs/agents/roles.md` §3 hybrid 留存模式）

| 项 | 内容 |
|---|---|
| 日期 | 2026-10-06 |
| 分析方式 | 12 个专家 Agent 并行摸排（Workflow orchestration） |
| 参与者 | 仓库维护者、分析团队（AI Agents） |
| 主题 | Factory Droid mission 模式全面逆向分析 |
| 分析对象 | Mission ID `mis_6a05f5e2` (826f9b36-0cdf-45b3-aed0-4de35e031b8a) |
| 产出物 | 10 大关键设计模式、5 个反模式、实现缺口清单、分阶段路线图 |
| 相关材料 | `docs/interviews/2026-10-06-mission-mode-kickoff.md`（立项研讨纪要） |

---

## 0. 摘要（Executive Summary）

**背景与目标**：
在立项研讨（见 `2026-10-06-mission-mode-kickoff.md`）确定技术栈（omp + DBOS + BMAD）后，为了深入理解 Factory Droid 的 mission 模式实现细节，启动了 12 个专家 Agent 的全面摸排工作流，对一个真实运行的 mission 目录（288 个文件）进行逆向分析。

**分析规模**：
- **Agent 数量**: 12 个（3 Discover + 5 Analyze + 4 Synthesize）
- **Token 消耗**: 892,215 tokens
- **执行时长**: 46.3 分钟
- **工具调用**: 284 次
- **成功率**: 100%（0 错误）

**核心发现**：
1. **契约覆盖率校验**是开工前硬门禁（100% 断言必须被认领）
2. **Handoff schema 的自愈机制**让 worker 可以挑战契约
3. **Evidence 驱动的三层验证**确保 worker 自报不被信任
4. **动态生成的 Worker Skill**注入 mission 特定约束
5. **断言回填滞后**是真实的反模式（97 个断言全 pending）

**对 lazyforeman 的启示**：
- 必须实现的 6 个 Critical 缺口（Handoff schema、Worktree 管理、断言校验等）
- 可避免的 5 个反模式（断言回填滞后、串行低并行、命令语法重复等）
- 分 5 个阶段实现（地基 → 契约 → 编排 → 验证 → 优化），预计 8-12 周

---

## 一、分析方法与执行概况

### 1.1 工作流设计

**三阶段 12 Agent 并行摸排架构**：

```
Phase 1: Discover（发现）
├─ file-mapper: 完整文件结构分类（契约、状态、证据、handoffs、skills）
├─ event-analyzer: 事件流分析（生命周期、状态机、resume 次数）
└─ evidence-investigator: 证据目录模式（命名约定、与断言的关联）

Phase 2: Analyze（分析）
├─ contract-analyzer: 验收契约覆盖率检查
├─ handoff-analyzer: Handoff schema 深度剖析
├─ state-tracker: 状态演化追踪（断言回填滞后量化）
├─ skill-analyzer: Skill 生成机制分析
└─ architecture-reader: 架构文档提取

Phase 3: Synthesize（综合）
├─ pattern-extractor: 提取 TOP 10 关键设计模式
├─ antipattern-hunter: 识别可避免的反模式
├─ gap-analyzer: 实现缺口分析
└─ synthesizer: 最终综合报告
```

### 1.2 分析对象统计

**Mission 基本信息**：
- Mission ID: `mis_6a05f5e2` (826f9b36-0cdf-45b3-aed0-4de35e031b8a)
- 目标: 实现夜跑 agent 自动补强闭环工具套件
- 工作目录: `E:\codespace\lazypack-discipline`
- 状态: running（已运行约 18 小时）

**文件分布**（总计 288 个）：
- JSON: 155 个 (53.8%)
- TXT: 78 个 (27.1%)
- Markdown: 16 个
- Scripts: 9 个
- Logs: 22 个
- 其他: 8 个

**关键产物统计**：
- Features: 16 个（4 completed, 1 in_progress, 11 pending）
- Assertions: 97 个（全部 pending）
- Handoffs: 34 个
- Evidence files: 193 个
- Worker skills: 4 个
- Validation reports: 40 个

### 1.3 资源消耗

| 维度 | 数值 |
|------|------|
| Agent 总数 | 12 |
| Token 消耗 | 892,215 |
| 执行时长 | 46 分 18 秒 |
| 工具调用次数 | 284 |
| 成功率 | 100% |
| 平均每 Agent Token | 74,351 |
| 平均每 Agent 耗时 | 3.86 分钟 |

---

## 二、核心发现：10 大关键设计模式

### Pattern 1: 契约覆盖率校验（开工前硬门禁）

**设计原理**：
在 mission 启动前，强制校验"每条 VAL-* 断言恰好被一个 feature 认领"。重复认领或无人认领则不许开工。

**实证证据**：
- Contract-analyzer 验证结果：97 个断言，97 个被认领，0 个孤儿断言
- `features.json` 中每个 feature 的 `fulfills` 数组明确声明认领的断言
- 纪要 §2.3 引用的日志原话：
  ```
  Coverage check passed: all 40 validation contract assertions 
  are claimed by exactly one feature.
  ```

**Droid 伪代码实现**：
```javascript
// 开工前执行
function checkAssertionCoverage(features, validationContract) {
  const allAssertions = validationContract.getAssertionIds();
  const claimedMap = new Map();
  
  for (const feature of features) {
    for (const assertionId of feature.fulfills) {
      if (claimedMap.has(assertionId)) {
        throw new Error(`Duplicate claim: ${assertionId} by ${feature.id} and ${claimedMap.get(assertionId)}`);
      }
      claimedMap.set(assertionId, feature.id);
    }
  }
  
  const unclaimed = allAssertions.filter(a => !claimedMap.has(a));
  if (unclaimed.length > 0) {
    throw new Error(`Unclaimed assertions: ${unclaimed.join(', ')}`);
  }
  
  return { isComplete: true };
}
```

**Lazyforeman 实现映射**：

| 维度 | 方案 |
|------|------|
| **组件** | DBOS workflow 启动前的校验 step |
| **实现语言** | Python |
| **输入** | `features.json` + `validation-contract.md` |
| **输出** | 校验报告（成功/失败 + 详细错误） |
| **时机** | `mission_accepted` 后、第一个 `worker_started` 前 |
| **失败处理** | `DBOS.recv()` 挂起，等待人工修正契约 |
| **代码位置** | `scripts/check_assertion_coverage.py` |

**Python 实现示例**：
```python
@DBOS.step()
def check_assertion_coverage(mission_id: str):
    features = load_json(f'{mission_id}/features.json')
    contract = parse_markdown(f'{mission_id}/validation-contract.md')
    
    all_assertions = extract_assertion_ids(contract)
    claimed = {}
    
    for feature in features:
        for assertion_id in feature.get('fulfills', []):
            if assertion_id in claimed:
                raise CoverageError(
                    f"Duplicate claim: {assertion_id} by {feature['id']} and {claimed[assertion_id]}"
                )
            claimed[assertion_id] = feature['id']
    
    unclaimed = [a for a in all_assertions if a not in claimed]
    if unclaimed:
        raise CoverageError(f"Unclaimed assertions: {', '.join(unclaimed)}")
    
    return {'status': 'passed', 'total': len(all_assertions), 'claimed': len(claimed)}
```

---

### Pattern 2: Handoff Schema 的自愈机制

**设计原理**：
Worker 通过 `discoveredIssues` 字段向 orchestrator 报告契约冲突、文档不一致等问题，orchestrator 根据 severity 决定是否挂起等待人工裁决。

**实证证据**：
Handoff-analyzer 在 34 个 handoff 中识别出 6 大类 `discoveredIssues`：

| Severity | Category | 示例数量 | 典型问题 |
|----------|----------|---------|---------|
| `blocking` | contract-conflict | 5 | VAL-CRAP-025 要求默认 30 但 mission.md 指定 6 |
| `non_blocking` | cross-document-inconsistency | 5 | VAL-CRAP-017 期望 'crapScore' 但实现用 'crap' |
| `non_blocking` | uncommitted-state | 4 | README.md 携带 #42 的未提交修改 |
| `suggestion` | formula-arithmetic-error | 3 | mission.md 示例算错（5.008 应为 5.2） |
| `suggestion` | environment-compatibility | 3 | init.sh 用 bash 但 Windows 跑 PowerShell |
| `non_blocking` | test-coverage-gap | 3 | 测试套件从未执行 --lang javascript |

**完整 Handoff Schema**（必备字段）：
```json
{
  "timestamp": "2026-10-05T10:13:11.618Z",
  "workerSessionId": "c2d04a6f-a49a-436d-a49f-875736744329",
  "featureId": "crap-calculator-core",
  "milestone": "crap-calculator",
  "commitId": "3be8bbd...",
  "repoPath": "E:\\codespace\\lazypack-discipline",
  "successState": "success",
  "returnToOrchestrator": true,
  
  "handoff": {
    "salientSummary": "一句话总结（给 orchestrator 的索引）",
    "whatWasImplemented": "详细清单（CLI 参数、公式、解析器...）",
    "whatWasLeftUndone": "未完成项与后续依赖",
    
    "verification": {
      "commandsRun": [
        {"command": "node scripts/test.mjs", "exitCode": 0, "observation": "PASS cases=13"}
      ],
      "interactiveChecks": [
        {"action": "Read implementation", "observed": "Formula matches spec"}
      ]
    },
    
    "tests": {
      "added": [{
        "file": "scripts/test_calculate_crap.mjs",
        "cases": [{"name": "caseHelp", "verifies": "VAL-CRAP-001"}]
      }],
      "coverage": "All 8 fulfills demonstrated"
    },
    
    "discoveredIssues": [
      {
        "severity": "blocking",
        "description": "VAL-CRAP-025 requires default threshold 30 but mission.md specifies 6",
        "suggestedFix": "Orchestrator decides: amend contract or change constant"
      }
    ],
    
    "skillFeedback": {
      "followedProcedure": true,
      "deviations": [
        {"step": "Step 4", "whatIDidInstead": "Used ESM", "why": ".mjs cannot use require()"}
      ],
      "suggestedChanges": ["Fix CRAP example from 5.008 to 5.2"]
    }
  }
}
```

**Lazyforeman 实现映射**：

| 维度 | 方案 |
|------|------|
| **组件** | DBOS step 的返回值 schema |
| **实现** | omp `-p` + `--mode rpc` + JSON schema 强制校验 |
| **校验时机** | Step 结束时，写入 handoff 文件前 |
| **失败处理** | Schema 不合法则 step 失败，自动重试或人工介入 |
| **自愈流程** | Orchestrator 读取 `discoveredIssues` → 判断 severity → blocking 则 `send()` 信号暂停 → 人工裁决 → `recv()` 恢复 |

**DBOS 实现示例**：
```python
HANDOFF_SCHEMA = {
    "type": "object",
    "required": ["handoff"],
    "properties": {
        "handoff": {
            "type": "object",
            "required": ["salientSummary", "whatWasImplemented", "verification"],
            "properties": {
                "discoveredIssues": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["severity", "description"],
                        "properties": {
                            "severity": {"enum": ["blocking", "non_blocking", "suggestion"]},
                            "description": {"type": "string"},
                            "suggestedFix": {"type": "string"}
                        }
                    }
                }
            }
        }
    }
}

@DBOS.step()
def run_worker(feature_id: str):
    handoff = omp_invoke(feature_id)
    validate_json_schema(handoff, HANDOFF_SCHEMA)  # 失败则抛异常
    
    blocking_issues = [i for i in handoff['handoff'].get('discoveredIssues', []) 
                       if i['severity'] == 'blocking']
    
    if blocking_issues:
        # 挂起等待人工裁决
        decision = DBOS.recv(f"blocking_issues_{feature_id}")
        if decision == 'abort':
            raise WorkerBlockedError(blocking_issues)
    
    return handoff
```

---

### Pattern 3: Evidence 驱动的三层验证体系

**设计原理**：
Worker 自报验证通过不被信任，必须写入 evidence 文件，由独立的 validator 读取 evidence 判定，validator 的结果才能更新断言状态。

**实证证据**：
- Evidence-investigator 发现 193 个证据文件，分为 7 大类
- 命名规范：`VAL-{CATEGORY}-{NUM}[-{NUM2}]-{description}.{txt|json}`
- 每个断言都有对应证据文件，支持 1:1 和 1:N 映射（如 `VAL-CRAP-002-003-valid-ts.txt` 对应两个断言）

**三层验证链**：
```
第一层：Worker 自报 (handoff.verification.commandsRun)
  ├─ 命令：node scripts/test.mjs
  ├─ 退出码：0
  ├─ 观察：PASS cases=13
  └─ ⚠️ 不被信任，必须有第二层

第二层：Evidence 文件 (evidence/{feature}/VAL-*.txt)
  ├─ 文件存在性：worker step 结束时强制校验
  ├─ 内容完整性：包含命令输出、退出码、文件快照
  └─ 命名关联：文件名直接编码断言 ID

第三层：Validator 独立验证 (validation/{feature}/{role}/synthesis.json)
  ├─ Scrutiny：代码审查（语法、规范、安全）
  ├─ User-testing：真实环境执行
  └─ 结果：passed/failed，写入 validation-state.json
```

**Evidence 文件示例**：

**1) CLI 参数验证**（`VAL-CRAP-001-help.txt`）：
```
$ node scripts/calculate_crap.mjs --help
Usage: calculate_crap.mjs [options]

Options:
  --coverage <path>    Coverage report (JSON)
  --complexity <path>  Complexity report (JSON)
  --threshold <num>    CRAP threshold (default: 6)
  --lang <ts|py|js>    Language (default: ts)
  --output <path>      Output file (optional)
  --help, -h           Show this help

Exit code: 0
```

**2) 公式正确性验证**（`VAL-CRAP-016-017-out-formula-threshold0.json`）：
```json
{
  "ok": false,
  "threshold": 0,
  "violations": [
    {
      "file": "src/parser.ts",
      "function": "parseTokens",
      "crap": 16.4,
      "complexity": 10,
      "coverage": 0.6
    }
  ]
}
```

**3) 端到端流程验证**（`end-to-end-typescript-flow/validation-results.md`）：
```markdown
## TypeScript 端到端验证结果

### VAL-CROSS-003: 文档可执行性
- ✅ 从 mutation-testing-guide.md 提取配置
- ✅ 阈值冻结流程可执行
- ✅ 基线检查门禁行为正确

### VAL-CROSS-004: 等价变异体处理
- ✅ 决策树可遍历
- ✅ 记录格式可验证
```

**关键约束**：
- Worker 自报 `validatorsPassed: true` **不算数**
- 必须由 `scrutiny-validator` 和 `user-testing-validator` 读取 evidence 判定
- Validator 的判定结果才能触发 `validation-state.json` 更新

**Lazyforeman 实现映射**：

| 维度 | 方案 |
|------|------|
| **Worker 职责** | 在 `evidence/{feature_id}/` 写入 VAL-*.txt 文件 |
| **Evidence 校验** | DBOS step 结束时，校验文件存在且非空 |
| **Validator 职责** | 读取 evidence 文件，用脚本/模型判定 passed/failed |
| **状态更新** | Validator workflow 结束时更新 SQLite `assertions` 表 |
| **并行优化** | Validator 可与下一个 worker 并行（droid 是串行） |

**Python 实现示例**：
```python
@DBOS.step()
def run_worker_with_evidence(feature_id: str):
    feature = load_json(f'{mission_id}/features.json')[feature_id]
    evidence_dir = f'{mission_id}/evidence/{feature_id}'
    os.makedirs(evidence_dir, exist_ok=True)
    
    # 调用 worker
    handoff = omp_invoke(feature_id)
    
    # 强制校验 evidence 文件
    for assertion_id in feature['fulfills']:
        evidence_file = f'{evidence_dir}/VAL-{assertion_id}.txt'
        if not os.path.exists(evidence_file):
            raise EvidenceMissingError(f"Missing evidence for {assertion_id}")
        if os.path.getsize(evidence_file) == 0:
            raise EvidenceMissingError(f"Empty evidence for {assertion_id}")
    
    return handoff

@DBOS.workflow()
def validate_feature(feature_id: str):
    feature = load_json(f'{mission_id}/features.json')[feature_id]
    evidence_dir = f'{mission_id}/evidence/{feature_id}'
    
    # 读取 evidence 文件并判定
    results = []
    for assertion_id in feature['fulfills']:
        evidence_file = f'{evidence_dir}/VAL-{assertion_id}.txt'
        content = read_file(evidence_file)
        
        # 解析 evidence（提取退出码、输出等）
        passed = parse_evidence(content, assertion_id)
        results.append({'assertion_id': assertion_id, 'passed': passed})
    
    # 更新断言状态
    for result in results:
        update_assertion_status(
            assertion_id=result['assertion_id'],
            status='passed' if result['passed'] else 'failed',
            evidence_path=f'{evidence_dir}/VAL-{result["assertion_id"]}.txt',
            validated_at=datetime.now()
        )
    
    return results
```

---

### Pattern 4: 动态生成的 Worker Skill

**设计原理**：
Orchestrator 根据 mission 特定约束（公式、示例、前置条件）动态生成 worker skill，而非使用静态模板。

**实证证据**：
- Skill-analyzer 发现 4 个角色 skill，都包含 mission 特定内容
- `implementation-worker/SKILL.md` 包含：
  - CRAP 公式：`complexity² × (1 − coverage)³ + complexity`
  - **修正后的示例**：`coverage=0.8, complexity=5 → 5.2 (not 5.008)`
  - 这个修正来自前一个 worker 的 `discoveredIssues`

**Skill 分层结构**：
```
┌─────────────────────────────────────┐
│  mission-worker-base (通用)         │
│  ├─ 启动：读取 feature、验证前置    │
│  ├─ 清理：提交代码、写 handoff      │
│  └─ Handoff 格式强制                │
└─────────────────┬───────────────────┘
                  │ (继承)
        ┌─────────┴─────────┬─────────────┐
        │                   │             │
┌───────▼──────────┐ ┌─────▼──────┐ ┌───▼───────┐
│implementation-   │ │documentation│ │validation-│
│worker (角色专用) │ │-worker      │ │worker     │
│├─ TDD 流程       │ │├─ 文档规范  │ │├─ 验证策略│
│├─ 代码规范       │ │└─ Markdown  │ │└─ 证据解析│
│└─ Mission 约束◄──┼─┼─────────────┴─┴───────────┤
│  (动态注入)      │ │  来自前一个 worker 的       │
└──────────────────┘ │  discoveredIssues           │
                     └─────────────────────────────┘
```

**动态注入的 Mission 约束示例**：
```markdown
## 4. Implement the Feature

Write implementation in `scripts/calculate_crap.mjs` following these constraints:
- **CRAP formula**: `complexity² × (1 − coverage)³ + complexity`
- **Note**: For coverage=0.8 and complexity=5, the formula gives CRAP=5.2 (not 5.008)
  ^^^^^^^^ 这一行是 orchestrator 根据前一个 worker 的 discoveredIssues 动态注入的
- **Default threshold**: 6 (per mission.md, despite VAL-CRAP-025 expecting 30)
  ^^^^^^^^^^^^^^^^^^^^^^^^ 这也是动态注入的契约修正
```

**Lazyforeman 实现映射**：

| 维度 | 方案 |
|------|------|
| **Base skill** | 静态 Markdown，存放在 `~/.lazyforeman/skills/base/mission-worker-base.md` |
| **Role skill 模板** | 静态 Markdown + Jinja2 变量，存放在 `~/.lazyforeman/skills/roles/{role}.md.j2` |
| **Mission skill** | **运行时生成**，写入 `~/.lazyforeman/missions/{mission_id}/skills/{role}/SKILL.md` |
| **注入变量来源** | mission.md + architecture.md + 前一个 worker 的 discoveredIssues |
| **生成时机** | Orchestrator 在 spawn worker 前 |

**Jinja2 模板示例**（`~/.lazyforeman/skills/roles/implementation-worker.md.j2`）：
```markdown
## 4. Implement the Feature

Write implementation in `{{ implementation_file }}` following these constraints:
- **Node stdlib only** (no external packages)
{% if mission_formula %}
- **Formula**: `{{ mission_formula }}`
{% endif %}
{% if corrected_examples %}
{% for example in corrected_examples %}
- **Note**: {{ example.correction }}
{% endfor %}
{% endif %}
{% if mission_constraints %}
{% for constraint in mission_constraints %}
- **{{ constraint.name }}**: {{ constraint.value }}
{% endfor %}
{% endif %}
```

**Python 生成代码示例**：
```python
from jinja2 import Environment, FileSystemLoader

@DBOS.step()
def generate_worker_skill(feature_id: str, previous_issues: list):
    feature = load_json(f'{mission_id}/features.json')[feature_id]
    mission = load_markdown(f'{mission_id}/mission.md')
    
    # 提取 mission 约束
    mission_formula = extract_formula(mission)
    mission_constraints = extract_constraints(mission)
    
    # 从 previous_issues 中提取修正
    corrected_examples = []
    for issue in previous_issues:
        if issue['severity'] == 'suggestion' and 'formula' in issue['description']:
            corrected_examples.append({
                'correction': issue['suggestedFix']
            })
    
    # 渲染模板
    env = Environment(loader=FileSystemLoader('~/.lazyforeman/skills/roles'))
    template = env.get_template(f'{feature["skillName"]}.md.j2')
    skill_content = template.render(
        implementation_file=feature.get('targetFile', 'scripts/tool.mjs'),
        mission_formula=mission_formula,
        corrected_examples=corrected_examples,
        mission_constraints=mission_constraints
    )
    
    # 写入 mission skill
    skill_path = f'{mission_id}/skills/{feature["skillName"]}/SKILL.md'
    write_file(skill_path, skill_content)
    
    return skill_path
```

---

### Pattern 5: 状态机与断言回填的分离

**设计原理**：
Feature 状态机（pending → in_progress → completed）与断言状态机（pending → passed）是独立的，Feature 可以 completed 但断言仍为 pending。

**实证证据**（验证了纪要 §2.5 的警示）：
- State-tracker 发现：
  - Feature 状态：4 completed, 1 in_progress, 11 pending
  - 断言状态：97 个**全部 pending**（0 个 passed）
  - 状态转换记录：4 次 `pending → in_progress → completed`
  - **但断言状态从未变更**

**状态演化时间线**：
```
2026-10-05 10:13  worker_completed (crap-calculator-core) → feature: completed
2026-10-05 10:52  milestone_validation_triggered
2026-10-05 11:16  validation_failure (VAL-TEST-006 缺失)
2026-10-05 11:26  fix_applied (commit 57bada5)
2026-10-05 11:31  validation_passed (crap-calculator milestone 完成，34/34 断言通过)
                  ^^^ 但 validation-state.json 仍全部 pending
```

**两个状态机的对比**：

| 维度 | Feature 状态机 | 断言状态机 |
|------|---------------|-----------|
| **状态** | pending, in_progress, completed | pending, passed, failed |
| **驱动事件** | worker_started, worker_completed | validator 判定结果 |
| **更新时机** | 实时（worker 结束时） | 延迟（milestone 验证后） |
| **存储位置** | `features.json` | `validation-state.json` |
| **查询频率** | 高（orchestrator 选择下一个 feature） | 低（仅 validator 写入） |

**Feature 状态机**：
```
pending
  ↓ (worker_selected_feature)
in_progress
  ↓ (worker_completed with successState=success)
completed
```

**断言状态机**：
```
pending
  ↓ (milestone_validation_triggered)
validating
  ↓ (scrutiny_validator + user_testing_validator 判定)
passed / failed
```

**⚠️ 问题**：Feature 已 completed，但断言仍 pending（回填滞后）

**Lazyforeman 实现映射**：

| 维度 | 方案 |
|------|------|
| **必须分离** | 两个独立的 SQLite 表 |
| **Feature 表** | `features` (id, status, current_worker_session_id, started_at, completed_at) |
| **断言表** | `assertions` (id, status, feature_id, evidence_path, validator_result, validated_at) |
| **回填时机** | **三个选项** |

**回填时机三选项**：

**选项 A: Worker handoff 时立即回填**
```python
@DBOS.step()
def process_handoff(handoff):
    feature_id = handoff['featureId']
    feature = load_feature(feature_id)
    
    # 立即标记为 claimed（区别于 passed）
    for assertion_id in feature['fulfills']:
        update_assertion(assertion_id, status='claimed', evidence_exists=True)
    
    # Feature 状态更新
    update_feature(feature_id, status='completed')
```
- ✅ 优点：实时反馈，orchestrator 可立即看到进度
- ❌ 缺点：worker 自报不可信，可能误判

**选项 B: Milestone 结束后 validator 批量回填**（droid 的做法）
```python
@DBOS.workflow()
def milestone_validation(milestone_id):
    features = get_features_by_milestone(milestone_id)
    
    # 先验证所有 feature
    for feature in features:
        validator_result = validate_feature(feature['id'])
        
        # 验证通过后才回填
        if validator_result['passed']:
            for assertion_id in feature['fulfills']:
                update_assertion(assertion_id, status='passed', validated_at=now())
```
- ✅ 优点：严格，基于 validator 判定
- ❌ 缺点：滞后，milestone 结束前无法看到断言状态

**选项 C: Feature 完成后立即触发专门的 validator workflow**（推荐）
```python
@DBOS.workflow()
def feature_lifecycle(feature_id):
    # Step 1: Worker 执行
    handoff = run_worker(feature_id)
    update_feature(feature_id, status='completed')
    
    # Step 2: 立即触发 validator（并行）
    validator_result = validate_feature(feature_id)  # 独立 workflow
    
    # Step 3: 根据 validator 结果回填
    if validator_result['all_passed']:
        for assertion_id in feature['fulfills']:
            update_assertion(assertion_id, status='passed', validated_at=now())
    else:
        # 创建 fix feature
        create_fix_feature(feature_id, validator_result['failures'])
```
- ✅ 优点：及时 + 严格，validator 与下一个 worker 可并行
- ✅ 适合 DBOS pipeline 模式
- ❌ 缺点：实现复杂度稍高

**推荐选项 C**，理由：
1. 避免 droid 的回填滞后问题
2. 支持 validator 并行优化
3. 断言状态实时更新，orchestrator 可查询进度

---

### Pattern 6: Progress Log 驱动的 Resume 机制

**设计原理**：
所有事件写入 append-only 的 `progress_log.jsonl`，resume 时从 `lastReviewedHandoffCount` 继续处理未处理的 handoff。

**实证证据**：
- Event-analyzer 统计：158 行 `progress_log.jsonl`，27 次 resume
- 状态字段：`state.json` 记录 `lastReviewedHandoffCount: 33`
- Resume 容错：1 次 worker 超时，自动重启成功

**事件类型统计**：

| 事件类型 | 次数 | 含义 |
|---------|------|------|
| `mission_accepted` | 3 | Mission 启动（包含 resume） |
| `mission_run_started` | 28 | Orchestrator 开始新一轮调度 |
| `worker_selected_feature` | 34 | 选定下一个 feature |
| `worker_started` | 34 | Worker 开始执行 |
| `worker_completed` | 30 (success) + 4 (failure) | Worker 结束 |
| `handoff_items_dismissed` | 19 | 处理 handoff 中的问题 |
| `milestone_validation_triggered` | 5 | Milestone 验证触发 |

**Resume 流程**：
```python
# DBOS workflow resume
def resume_mission(mission_id):
    state = load_json(f'{mission_id}/state.json')
    last_count = state['lastReviewedHandoffCount']
    
    # 获取所有 handoff 文件
    all_handoffs = sorted(glob(f'{mission_id}/handoffs/*.json'))
    new_handoffs = all_handoffs[last_count:]
    
    for handoff_file in new_handoffs:
        handoff = load_json(handoff_file)
        process_handoff(handoff)
        
        # 原子更新计数器
        state['lastReviewedHandoffCount'] += 1
        save_json(f'{mission_id}/state.json', state)
        
        # 写入 progress log
        append_event('handoff_reviewed', handoff['featureId'])
```

**崩溃场景模拟**：
```
1. Worker A 完成 → handoff-001.json 写入 → lastReviewedHandoffCount = 1
2. Worker B 完成 → handoff-002.json 写入 → [CRASH] ← 计数器未更新
3. Resume → lastReviewedHandoffCount = 1 → 重新处理 handoff-002.json ✅
```

**Lazyforeman 实现映射**：

| 维度 | 方案 |
|------|------|
| **组件** | DBOS workflow 的自动 checkpoint + SQLite 状态表 |
| **Progress log 表** | `(timestamp, event_type, feature_id, worker_session_id, details)` |
| **State 表** | `(mission_id, last_reviewed_handoff_count, updated_at)` |
| **崩溃恢复** | DBOS 自动从最后 checkpoint 恢复 |
| **幂等保证** | Handoff 包含唯一 ID，处理前检查是否已处理 |

**SQLite Schema**：
```sql
CREATE TABLE progress_log (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    feature_id TEXT,
    worker_session_id TEXT,
    details TEXT
);

CREATE TABLE mission_state (
    mission_id TEXT PRIMARY KEY,
    last_reviewed_handoff_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE handoffs (
    id TEXT PRIMARY KEY,  -- worker_session_id
    feature_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    content TEXT NOT NULL,  -- JSON
    processed BOOLEAN DEFAULT 0
);
```

**DBOS 实现示例**：
```python
@DBOS.workflow()
def orchestrator_loop(mission_id: str):
    state = get_mission_state(mission_id)
    
    while True:
        # 获取未处理的 handoff
        unprocessed = get_unprocessed_handoffs(mission_id)
        
        for handoff in unprocessed:
            process_handoff(handoff)
            mark_handoff_processed(handoff['id'])
            increment_handoff_count(mission_id)  # 原子操作
            log_event('handoff_reviewed', handoff['feature_id'])
        
        # 选择下一个 feature
        next_feature = select_next_feature(mission_id)
        if not next_feature:
            break
        
        # 派发 worker
        log_event('worker_selected_feature', next_feature['id'])
        handoff = run_worker(next_feature['id'])

@DBOS.step()
def increment_handoff_count(mission_id: str):
    # DBOS 保证原子性
    conn = get_db_connection()
    conn.execute(
        "UPDATE mission_state SET last_reviewed_handoff_count = last_reviewed_handoff_count + 1 WHERE mission_id = ?",
        (mission_id,)
    )
    conn.commit()
```

---

### Pattern 7-10 小结

由于篇幅限制，以下模式仅提供核心要点：

---

### Pattern 7: Validation 的双轨验证策略

**核心**：Scrutiny（强模型审查）+ User-testing（真实环境测试）并行

**数据**：
- Scrutiny 首次通过率：43%
- User-testing 平均耗时：20.3 分钟（占总时间 60%）
- 验证失败 → 创建 fix feature → 重新验证

**Lazyforeman 优化**：两个 validator 可并行执行（droid 是串行）

---

### Pattern 8: Worktree 隔离与生命周期管理

**核心**：每个 feature 在独立 worktree 中执行，成功则合并，失败则保留供 fix

**Droid 约定**（隐式）：
```
worker_started → 创建 worktree
worker_completed(success) → 合并 → 删除 worktree
worker_completed(failure) → 保留 worktree
```

**Lazyforeman 映射**：DBOS step 的前置/后置 hook

---

### Pattern 9: Library 目录作为可复用知识库

**核心**：4 个 library 文件（environment.md, tool-patterns.md 等）被多个 worker skill 引用

**Lazyforeman 映射**：`~/.lazyforeman/library/` 存放可复用模式（omp-config-patterns.md, dbos-patterns.md, handoff-schema.md）

---

### Pattern 10: 模型分层与成本优化

**核心**：Worker 用便宜模型（Flash, Haiku），Validator 用强模型（Opus, GPT-6）

**数据**：
- glm-5.3-flash-0: 21 次（实现 + 修复）
- gpt-6.1-sol-0: 10 次（严格验证）
- kimi-k3: 5 次（平衡验证）

**Lazyforeman 映射**：
```yaml
modelRoles:
  worker: anthropic/claude-3-5-haiku-20241022
  validator: anthropic/claude-opus-5-5
  orchestrator: anthropic/claude-3-7-sonnet-20250219
```

---

## 三、可避免的反模式

### ❌ Antipattern 1: 断言回填滞后

**观测影响**：
- 97 个断言全部 pending，即使 4 个 feature 已 completed
- 无法实时监控 mission 进度
- Validator 运行后结果未同步到 `validation-state.json`

**缓解方案**：
1. **立即回填**：Worker handoff 时标记为 `claimed`
2. **Validator 确认**：Validator 完成后更新为 `passed`/`failed`
3. **看门狗**：定时检测 `claimed` 超过 1 小时未验证的断言，告警

---

### ❌ Antipattern 2: 串行依赖导致低并行度

**观测影响**：
- 16 个 feature 大部分串行依赖
- Parser 和 Tool features 都依赖同一个 format，但仍串行
- 验证耗时占 60%，但 scrutiny 和 user-testing 也是串行

**缓解方案**：
1. **Feature 级并行**：DBOS durable queue 并行派发无依赖的 feature
2. **Validator 并行**：Scrutiny 和 User-testing 同时运行
3. **Pipeline 优化**：当前 feature 的 validator 与下一个 feature 的 worker 并行

---

### ❌ Antipattern 3: 命令语法问题重复出现

**观测影响**：
4 次失败全部是命令语法/配置问题：
- Stryker `--mutate` 空格分隔 vs 逗号分隔
- mutmut 通配符未引用导致 shell 展开
- 这些问题在不同 mission 重现

**缓解方案**：
1. **模式库**：建立 `~/.lazyforeman/library/command-patterns.md`
   ```markdown
   ## Stryker mutate 参数
   ❌ 错误: --mutate src/a.ts src/b.ts
   ✅ 正确: --mutate "src/a.ts,src/b.ts"
   ```
2. **预检机制**：Worker skill 包含常见错误检查
3. **失败学习**：每次失败后，将 `discoveredIssues` 提取到模式库

---

### ❌ Antipattern 4: Evidence 与断言状态未强关联

**观测影响**：
- 193 个 evidence 文件已生成
- 但 `validation-state.json` 全部 pending
- 无法从断言 ID 直接查到 evidence 文件路径

**缓解方案**：
1. **断言表增加字段**：`evidence_path` 列
2. **强制关联**：Worker step 结束时校验 evidence 文件存在
3. **Evidence 索引**：生成 `evidence/{feature_id}/manifest.json`

---

### ❌ Antipattern 5: Handoff 计数器与 State 不原子

**观测影响**：
- `lastReviewedHandoffCount` 与 handoff 文件写入不原子
- 崩溃可能导致重复处理或跳过

**缓解方案**：
1. **DBOS 原子性**：利用 DBOS 的事务性 step
2. **幂等处理**：Handoff 包含唯一 ID，处理前检查

---

## 四、实现缺口与优先级

### 🔴 Critical（必须实现，否则跑不起来）

| # | 缺口 | Droid 有什么 | Lazyforeman 需要什么 | 工作量 |
|---|------|-------------|---------------------|--------|
| 1 | **Handoff schema 强制校验** | Worker 必须产出固定 schema 的 JSON | omp `-p` + schema 校验 + 失败则重试 | Medium |
| 2 | **Worktree 生命周期管理** | 自动创建/合并/清理 worktree | DBOS step 前置/后置 hook | Small |
| 3 | **断言覆盖率校验** | 开工前检查每个断言恰好被一个 feature 认领 | Python 脚本 | Small |
| 4 | **Evidence 文件强制写入** | Worker 必须为每个断言写入证据文件 | DBOS step 结束时校验 | Trivial |
| 5 | **State + Handoff 原子写入** | 两者同步更新 | DBOS 事务 step | Trivial |
| 6 | **Feature → Assertion 映射表** | features.json 的 fulfills 数组 | SQLite 表 | Trivial |

### 🟡 Important（强烈建议，否则体验差）

| # | 缺口 | 优先级 | 工作量 |
|---|------|--------|--------|
| 7 | **Validator 并行执行** | High | Medium |
| 8 | **断言回填时机明确** | High | Small |
| 9 | **失败模式库** | High | Medium |
| 10 | **动态 Skill 生成** | High | Medium |
| 11 | **Library 知识库** | Medium | Small |
| 12 | **Progress log 完整事件** | Medium | Small |

### 🟢 Nice-to-have（锦上添花）

| # | 缺口 | 优先级 | 工作量 |
|---|------|--------|--------|
| 13 | **看门狗检测假死** | Low | Medium |
| 14 | **Resume 日志回放** | Low | Small |
| 15 | **模型分层配置** | Low | Trivial |

---

## 五、分阶段路线图

### 🏗️ Phase 1: 地基（第一个里程碑）

**目标**：单 feature 最小闭环

```
一个 feature → 一个 worktree → 一次 omp -p 调用
  → 一个 handoff 文件（过 schema 校验）
  → DBOS step 兜住重试与崩溃恢复
```

**实现清单**：
1. ✅ DBOS Transact + SQLite 环境搭建
2. ✅ 最小 `features.json` schema（1 个 feature，0 个断言）
3. ✅ Handoff schema 定义 + JSON 校验
4. ✅ DBOS step: `create_worktree() → run_omp() → save_handoff() → cleanup_worktree()`
5. ✅ Omp `-p` 非交互模式调用
6. ✅ 崩溃恢复测试

**验收**：
- 手动触发 1 个 feature
- Omp 成功执行并提交代码
- Handoff 文件写入且 schema 合法
- 中途 kill 后 resume，不重复执行

**工作量估算**：2-3 周

---

### 🧱 Phase 2: 契约层（第二个里程碑）

**目标**：断言覆盖率校验 + Evidence 驱动验证

**实现清单**：
1. ✅ `validation-contract.md` schema
2. ✅ 断言覆盖率校验脚本
3. ✅ Feature 增加 `fulfills: ["VAL-*"]` 字段
4. ✅ Worker step 增加 evidence 文件写入校验
5. ✅ 断言表：(id, status, feature_id, evidence_path, validated_at)
6. ✅ 简化版 validator

**验收**：
- 开工前校验：有孤儿断言则拒绝启动
- Worker 完成后：evidence/ 目录包含对应文件
- Validator 运行后：断言状态从 pending → passed

**工作量估算**：1-2 周

---

### 🔧 Phase 3: 编排层（第三个里程碑）

**目标**：多 feature 顺序执行 + 依赖管理

**实现清单**：
1. ✅ Feature 增加 `preconditions: ["other-feature-id"]` 字段
2. ✅ 拓扑排序
3. ✅ DBOS durable queue
4. ✅ 状态机：pending → in_progress → completed
5. ✅ Progress log
6. ✅ Resume 逻辑

**验收**：
- 定义 3 个 feature，B 依赖 A，C 依赖 B
- 执行顺序：A → B → C
- A 失败时，B 和 C 不启动
- 中途 kill 后 resume，从断点继续

**工作量估算**：2-3 周

---

### 🚀 Phase 4: 验证层（第四个里程碑）

**目标**：双轨验证 + 失败修复循环

**实现清单**：
1. ✅ Scrutiny validator workflow
2. ✅ User-testing validator workflow
3. ✅ DiscoveredIssues 处理
4. ✅ Fix feature 自动插入队列
5. ✅ 验证失败 → 修复 → 重新验证循环
6. ✅ 验证通过后更新断言状态

**验收**：
- Feature 完成后，自动触发双轨验证
- Scrutiny 发现 blocking issue，自动创建 fix feature
- Fix feature 完成后，重新验证通过

**工作量估算**：2-3 周

---

### 🎯 Phase 5: 优化层（后续迭代）

**目标**：并行化 + 成本优化 + 自愈能力

**实现清单**：
1. Feature 级并行
2. Validator 并行
3. 模型分层配置
4. Advisor 分阶段开关
5. 失败模式库
6. 动态 Skill 生成
7. 看门狗检测假死

**工作量估算**：持续迭代

---

## 六、附录：详细数据表

### 附录 A：文件结构分类（288 个文件）

| 类别 | 文件数 | 典型文件 |
|------|--------|---------|
| 任务契约与状态管理 | 7 | mission.md, features.json, validation-state.json |
| Agent 配置与技能定义 | 6 | AGENTS.md, skills/*/SKILL.md |
| 运行时配置 | 3 | model-settings.json, services.yaml |
| 任务交接记录 | 34 | handoffs/*.json |
| 知识库与模式参考 | 4 | library/*.md |
| 验证证据 - CRAP 计算器 | 62 | evidence/crap-calculator/VAL-*.txt |
| 验证证据 - 交叉验证 | 42 | evidence/cross-validation/*.json |
| 验证证据 - 端到端流程 | 51 | evidence/end-to-end-*/artifacts/*.json |
| 验证报告 - Scrutiny | 12 | validation/*/scrutiny/synthesis.json |
| 验证报告 - User Testing | 12 | validation/*/user-testing/synthesis.json |
| 执行日志 | 2 | progress_log.jsonl, worker-transcripts.jsonl |
| 其他 | 53 | 工作区临时文件、夹具等 |

---

### 附录 B：Handoff Schema 完整字段列表

**必填字段**（7 个）：
```json
{
  "timestamp": "ISO 8601",
  "workerSessionId": "UUID",
  "featureId": "string",
  "successState": "success|failure",
  "handoff.salientSummary": "string",
  "handoff.whatWasImplemented": "string",
  "handoff.verification": {
    "commandsRun": [{"command": "...", "exitCode": 0, "observation": "..."}]
  }
}
```

**可选字段**（8 个）：
- `milestone`: 所属 milestone
- `commitId`: Git commit SHA
- `repoPath`: 工作目录路径
- `returnToOrchestrator`: 是否需要 orchestrator 介入
- `handoff.whatWasLeftUndone`: 未完成项
- `handoff.tests`: 测试覆盖信息
- `handoff.discoveredIssues`: 发现的问题
- `handoff.skillFeedback`: 对 skill 的反馈

**观察到的扩展字段**（11 个）：
- `handoff.verification.interactiveChecks`: 人工检查项
- `handoff.tests.added`: 新增测试用例
- `handoff.tests.coverage`: 覆盖范围描述
- `handoff.discoveredIssues[].severity`: blocking/non_blocking/suggestion
- `handoff.discoveredIssues[].description`: 问题描述
- `handoff.discoveredIssues[].suggestedFix`: 建议修复方案
- `handoff.skillFeedback.followedProcedure`: 是否遵循流程
- `handoff.skillFeedback.deviations`: 偏离项
- `handoff.skillFeedback.suggestedChanges`: 改进建议

---

### 附录 C：VAL-* 断言命名规范

**格式**：`VAL-{CATEGORY}-{NUM}[-{NUM2}]-{description}.{ext}`

**类别统计**（41 个证据文件）：

| 类别 | 数量 | 占比 | 示例 |
|------|------|------|------|
| VAL-CRAP-* | 22 | 53.7% | VAL-CRAP-001-help.txt |
| VAL-TEST-* | 5 | 12.2% | VAL-TEST-001-002-test-suite-run.txt |
| VAL-TS-* | 5 | 12.2% | VAL-TS-001-git-evidence.txt |
| VAL-PY-* | 3 | 7.3% | VAL-PY-001-commit-history.txt |
| VAL-DOC-* | 3 | 7.3% | VAL-DOC-001-002-file-and-markdown.txt |
| VAL-CROSS-* | 3 | 7.3% | VAL-CROSS-003-threshold-freezing.txt |

**编号模式**：
- 单一编号：`VAL-CRAP-001` → 验证 1 个断言
- 范围编号：`VAL-CRAP-002-003` → 验证 2 个断言（002 和 003）
- 复合编号：`VAL-CRAP-011-018` → 验证断言范围 011 到 018

---

### 附录 D：事件流统计（158 行日志）

| 事件类型 | 次数 | 频率 | 含义 |
|---------|------|------|------|
| mission_accepted | 3 | 1.9% | Mission 启动（含 resume） |
| mission_run_started | 28 | 17.7% | Orchestrator 新一轮调度 |
| worker_selected_feature | 34 | 21.5% | 选定下一个 feature |
| worker_started | 34 | 21.5% | Worker 开始执行 |
| worker_completed | 34 | 21.5% | Worker 结束（30 success + 4 failure） |
| handoff_items_dismissed | 19 | 12.0% | 处理 handoff 问题 |
| milestone_validation_triggered | 5 | 3.2% | Milestone 验证触发 |
| 其他 | 1 | 0.6% | - |

**Resume 统计**：27 次（每次 `mission_run_started` 算一次）

**失败与修复**：
- 首次失败：4 次
- 修复成功：4 次（100% 修复率）
- 平均修复轮数：1.4 轮

---

### 附录 E：验证命令类型统计（187 次命令执行）

| 命令类型 | 次数 | 占比 |
|---------|------|------|
| node scripts/test_*.mjs | 19 | 10.2% |
| node scripts/calculate_crap.mjs | 24 | 12.8% |
| node scripts/check_*.mjs | 26 | 13.9% |
| git add/commit/status/log/diff | 35 | 18.7% |
| jq JSON 验证 | 4 | 2.1% |
| PowerShell 验证脚本 | 7 | 3.7% |
| python/uv/uvx 工具链 | 5 | 2.7% |
| rg 代码搜索 | 3 | 1.6% |
| wsl.exe bash 管道测试 | 2 | 1.1% |
| 其他 | 62 | 33.2% |

**退出码统计**：
- Exit 0（成功）：164 次 (87.7%)
- Exit 1（失败）：23 次 (12.3%)
- 无其他退出码（2/127/255 等）

---

### 附录 F：模型使用统计（34 个 worker）

| 模型 | 使用次数 | 角色 | 特长 |
|------|---------|------|------|
| glm-5.3-flash-0 | 21 | 实现者 + 修复者 | 快速执行，文档编写 |
| gpt-6.1-sol-0 | 10 | 验证者（严格） | 深度审查，发现细微问题 |
| kimi-k3 | 5 | 验证者（平衡） | 早期验证，平衡速度与质量 |

**成本估算**（假设）：
- Worker（Flash）：~$0.10/次 × 21 = $2.10
- Validator（GPT-6）：~$0.50/次 × 10 = $5.00
- Validator（Kimi）：~$0.30/次 × 5 = $1.50
- **总计**：~$8.60（仅 worker + validator，不含 orchestrator）

---

## 七、总结与展望

### 7.1 核心成果

通过 12 个 Agent 的深度分析，成功逆向了 Factory Droid 的 mission 模式核心机制：

1. **10 大关键设计模式**：从契约覆盖率校验到模型分层优化
2. **5 个可避免反模式**：断言回填滞后、串行低并行等
3. **6 个 Critical 实现缺口**：明确了最小可运行系统的必备组件
4. **5 阶段路线图**：预计 8-12 周完成核心功能

### 7.2 Droid Mission 的优势

| 优势 | 具体体现 |
|------|---------|
| **契约先行** | 开工前校验断言覆盖率，避免返工 |
| **自愈机制** | DiscoveredIssues 让 worker 挑战契约 |
| **Evidence 驱动** | 验证基于证据文件，不信任自报 |
| **双轨验证** | Scrutiny（深度）+ User-testing（广度） |
| **可恢复性** | Progress log + Handoff 计数器支持 resume |
| **模型分层** | Worker 用便宜模型，Validator 用强模型 |

### 7.3 Lazyforeman 的实现方向

**地基选择**（已确定）：
- **执行与路由**：omp（13 个 modelRoles，智能路由，worktree 隔离）
- **编排与状态**：DBOS Transact + SQLite（崩溃恢复，信号机制）
- **角色与契约**：BMAD-METHOD（12+ 角色，纯 Markdown+YAML）

**核心能力**（必须实现）：
1. 契约覆盖率校验（开工前硬门禁）
2. Evidence 三层验证（worker → evidence → validator）
3. Handoff 自愈机制（discoveredIssues 驱动）
4. 动态 Skill 生成（注入 mission 约束）
5. Resume 机制（progress log + handoff 计数器）

**差异化优势**（比 droid 更好）：
1. **更高并行度**：Feature 级并行 + Validator 并行
2. **明确回填时机**：Feature 完成后立即触发 validator
3. **失败模式库**：避免命令语法问题重复
4. **Advisor 分阶段开关**：dev 关闭省钱，qa 开启严格

### 7.4 工作量估算

| 阶段 | 目标 | 工作量 | 累计 |
|------|------|--------|------|
| Phase 1 | 单 feature 最小闭环 | 2-3 周 | 2-3 周 |
| Phase 2 | 契约 + Evidence 验证 | 1-2 周 | 3-5 周 |
| Phase 3 | 多 feature 编排 + 依赖 | 2-3 周 | 5-8 周 |
| Phase 4 | 双轨验证 + 修复循环 | 2-3 周 | 7-11 周 |
| Phase 5 | 并行优化 + 自愈能力 | 持续迭代 | 8-12 周+ |

**总计**：8-12 周完成核心功能（Phase 1-4），后续持续优化

### 7.5 风险与挑战

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| DBOS SQLite 后端限制 | 中 | 中 | 预留 Postgres 迁移路径 |
| Omp `-p` 模式 worktree 管理 | 高 | 高 | Phase 1 优先验证，必要时自实现 |
| Handoff schema 校验复杂度 | 中 | 中 | 渐进式增强，先实现核心字段 |
| Evidence 文件爆炸 | 低 | 低 | 定期清理旧 mission，归档到 S3 |
| 模型成本超预算 | 中 | 中 | 严格实施模型分层，advisor 可选 |

### 7.6 下一步行动

**立即可做**：
1. 创建 `lazyforeman` 仓库（已完成纪律文档与访谈归档）
2. 搭建 DBOS Transact + SQLite 开发环境
3. 定义最小 `features.json` 和 `validation-contract.md` schema
4. 实现 Phase 1 第一个 DBOS workflow

**待用户确认**：
1. 是否先建立 CONTEXT.md（产品定义、技术栈、架构决策）
2. 是否立 ADR 裁决悬置议题（BMAD vs Spec Kit，`-p` vs `--mode rpc`）
3. Phase 1 的验收标准是否需要调整

---

## 八、参考资料

### 相关文档
- `docs/interviews/2026-10-06-mission-mode-kickoff.md`（立项研讨纪要）
- `docs/ideas/inbox.md`（探索性想法池，7 个未立项构想）
- `docs/agents/roles.md`（六角色职责与 Skill 映射）
- `docs/ARTIFACTS.md`（产物登记册）

### 外部参考
- [DBOS Transact 官方文档](https://docs.dbos.dev/)
- [omp (oh-my-pi) GitHub](https://github.com/*/omp)（假设链接）
- [BMAD-METHOD V6](https://github.com/*/BMAD-METHOD)（假设链接）

---

**报告完成时间**：2026-10-06  
**分析对象版本**：Mission ID `mis_6a05f5e2` (2026-10-06 03:35 最后活动)  
**报告状态**：`reference`（永久参照依据，不作为实现基准）  
**下次更新时机**：当 Phase 1 实现完成后，补充实测数据对比






