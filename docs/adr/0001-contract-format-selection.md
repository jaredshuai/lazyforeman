# ADR 0001: 契约格式选择（BMAD vs Spec Kit）

## 状态

**提议中** (Proposed)

## 上下文

Lazyforeman 的 mission 系统需要一套契约格式来定义：
1. 需求规格（用户想要什么）
2. 验收断言（如何证明做到了）
3. Feature 分解（如何拆解为可并行的实现单元）

立项研讨（`docs/interviews/2026-10-06-mission-mode-kickoff.md` §6.2）识别出两个候选方案，但未立即裁决。深度分析（`docs/interviews/2026-10-06-droid-mission-deep-analysis.md`）揭示了 droid 的契约格式实践，但 droid 本身未明确使用 BMAD 或 Spec Kit。

现在到了必须裁决的时刻，因为 Phase 2（契约层）的实现依赖这一选择。

## 决策驱动因素

### 断言账本的刚性约束

Lazyforeman 的核心是**断言驱动验证**：

```
validation-contract.md（所有 VAL-* 断言）
  ↓
features.json（每个 feature 认领断言）
  ↓
evidence/{feature}/VAL-*.txt（worker 写入证据）
  ↓
validator 读取 evidence 判定通过/失败
  ↓
更新 assertions 表状态
```

契约格式必须：
1. **支持断言可机器解析**（脚本能提取所有 VAL-* ID）
2. **支持断言与 feature 映射**（明确哪个 feature 负责哪些断言）
3. **支持 worker 理解断言**（生成的 skill 能引用具体断言）

### 两个候选方案对比

#### 选项 A：BMAD-METHOD

**来源**：[BMAD-METHOD V6](https://github.com/cyanheads/BMAD-METHOD)

**格式特点**：
- PRD（产品需求文档）
- Technical Architecture（技术架构）
- User Stories（用户故事）
- 角色流（Orchestrator → Architect → Implementer → Reviewer）

**优势**：
- ✅ 贴近软件工程角色流
- ✅ 有现成的 12+ 角色定义
- ✅ PRD + Architecture 分离清晰

**劣势**：
- ❌ **断言格式不明确**：User Stories 不等于可机器解析的断言
- ❌ V6 与 V4 版本分叉（V4 教程多，V6 文档少）
- ❌ 需要额外设计断言 → Story 的映射层

#### 选项 B：Spec Kit

**来源**：假设为 [spec-kit](https://github.com/*/spec-kit)（130K+ stars）

**格式特点**（推测，基于"以 spec 为中心"的描述）：
- Spec 文档（Markdown with YAML front-matter）
- 验收条件（Acceptance Criteria）
- 示例（Examples）
- agent 无关（纯文本契约）

**优势**：
- ✅ 以 spec 为中心，验收条件天然适合作为断言
- ✅ 社区成熟（130K+ stars）
- ✅ Agent 无关（不绑定特定 AI 工具）

**劣势**：
- ❌ **未实际调研**：目前仅有"130K+ stars"的描述，未读过实际文档
- ❌ **角色流不明确**：如果它不定义角色，需要自己补充
- ❌ **未知断言格式**：需要验证它的 Acceptance Criteria 是否支持 VAL-* 编号

#### 选项 C：自定义格式（基于 droid 观察）

**来源**：`docs/interviews/2026-10-06-droid-mission-deep-analysis.md`

**格式特点**（droid 实际使用的）：
- `validation-contract.md`：纯 Markdown，每条断言一个 `## VAL-{CATEGORY}-{NUM}` 标题
- `features.json`：JSON 格式，每个 feature 有 `fulfills: ["VAL-*"]` 数组
- `mission.md`：自然语言描述需求
- `architecture.md`：技术架构文档

**优势**：
- ✅ **已验证可行**：droid 用这套格式跑了 80+ 断言的 mission
- ✅ **断言格式明确**：Markdown 标题 = 可机器解析
- ✅ **灵活**：Markdown 可读性强，JSON 可编程性强
- ✅ **零依赖**：不绑定外部框架

**劣势**：
- ❌ **角色定义缺失**：droid 有 4 个 worker skill，但没有完整的 12 角色体系
- ❌ **缺乏社区**：自定义格式意味着没有外部贡献者
- ❌ **需要自己维护**：所有文档模板、解析器都要自己写

## 决策

**暂不裁决**，先做调研：

### 调研任务

1. **Spec Kit 实地调研**（优先级：High）
   - 找到 spec-kit 的实际仓库（确认是否真有 130K+ stars）
   - 阅读其 Acceptance Criteria 格式
   - 验证是否支持 VAL-* 编号或类似机制
   - 评估是否支持 feature → assertion 映射

2. **BMAD V6 断言格式确认**（优先级：Medium）
   - 阅读 BMAD V6 的 User Story 格式
   - 确认是否有内置的验收断言机制
   - 评估是否需要自己补充断言层

3. **Droid 格式完整性验证**（优先级：Low）
   - 确认 droid 是否有遗漏的契约文档
   - 评估自定义格式的长期维护成本

### 决策标准

调研完成后，按以下标准裁决：

| 标准 | 权重 | 说明 |
|------|------|------|
| 断言可机器解析 | 40% | 必须支持脚本提取 VAL-* ID |
| Feature 映射清晰 | 30% | 必须支持 `fulfills` 数组或等价机制 |
| Worker 可理解 | 20% | 生成的 skill 能引用断言 |
| 社区成熟度 | 10% | 外部贡献者、教程、案例 |

**阈值**：总分 ≥ 70 分才采用，否则回退到选项 C（自定义格式）

## 后果

### 如果选择 BMAD

- ✅ 复用 12 角色定义，节省设计时间
- ❌ 需要补充断言层（User Story → VAL-*）
- ❌ V6 文档少，学习成本高

### 如果选择 Spec Kit

- ✅ 社区成熟，教程多
- ✅ Spec 为中心，契合"契约先行"
- ❌ 角色流需要自己补充
- ⚠️ 待验证：断言格式是否匹配

### 如果选择自定义格式（回退方案）

- ✅ 完全控制，灵活调整
- ✅ 已验证可行（droid 证明）
- ❌ 无社区，全靠自己维护
- ❌ 需要从零编写所有模板

## 时间表

| 时间点 | 里程碑 |
|--------|--------|
| 2026-10-06 | ADR 立项 |
| 2026-10-07 | 完成 Spec Kit 调研 |
| 2026-10-08 | 完成 BMAD V6 调研 |
| 2026-10-09 | 裁决并更新 ADR 状态为 Accepted |
| 2026-10-10 | 开始 Phase 2 实现 |

**阻塞**：Phase 2 的 `validation-contract.md` 模板生成被阻塞，Phase 1 可以继续（不依赖契约格式）

## 参考资料

- `docs/interviews/2026-10-06-mission-mode-kickoff.md` §6.2（议题二：契约格式）
- `docs/interviews/2026-10-06-droid-mission-deep-analysis.md` 附录 B（Handoff Schema）
- `docs/ideas/inbox.md` IDEA-261006-06（未立项想法）
- [BMAD-METHOD V6](https://github.com/cyanheads/BMAD-METHOD)
- Spec Kit（待确认链接）

---

**创建时间**：2026-10-06  
**作者**：项目负责人  
**审查者**：待分配  
**下次审查**：2026-10-09（调研完成后）
