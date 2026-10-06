# Agent Configuration

## Agent skills

### Issue tracker

Issues 存储在 GitHub Issues 中，使用 `gh` CLI 管理。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用默认的五个标准 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

Single-context 布局：一个 `CONTEXT.md` 文件和 `docs/adr/` 目录位于仓库根目录。详见 `docs/agents/domain.md`。

<!-- lazypack:start block=resident-discipline src=DECISIONS.md@0.4.0 gen=2026-10-06 input=sha256:f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8 fp=sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2 -->
## 工程纪律指针 (lazypack-discipline)

> 派生自 lazypack-discipline 固定层 DECISIONS.md@0.4.0（依据 lazypack-setup 内置快照编译，来源内容标识: b0bfa054107a9a4c18d8e64a500b4db9bae059bb；离线事实源查阅 lazypack-setup/references/DECISIONS.md）。本段为受管托管区，请勿手工破坏标记行。

- **纪律唯一事实源**：固定层规则跨项目不变。如需修改固定层，须走多 AI 讨论章程（§9）。
- **双角色门禁要求**：执行者和审查者都必须运行适用的质量门禁；未接线、不适用、运行失败等按事实报告，不宣称通过或已生效。
- **角色与职责**：查阅 [docs/agents/roles.md](docs/agents/roles.md)，遵循各角色防撞车边界与项目指引。
- **产物登记册**：查阅 [docs/ARTIFACTS.md](docs/ARTIFACTS.md)，了解各产物的权威状态与生命周期。
- **编码标准**：查阅 [CODING_STANDARDS.md](CODING_STANDARDS.md)，执行质量门禁与双轨制要求。
- **发版纪律**：查阅 [RELEASE.md](RELEASE.md)，遵循提交规范与版本映射规则。
<!-- lazypack:end block=resident-discipline -->
