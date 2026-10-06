import type { Handoff } from "../../../src/types/handoff.js";

/**
 * Mock Handoff 示例：包含 discoveredIssues
 */
export const mockHandoffWithIssues: Handoff = {
	id: "handoff-test-001",
	featureId: "feat-001",
	salientSummary: "实现用户登录表单，发现后端依赖问题",
	whatWasImplemented: [
		"登录表单 UI 组件（LoginForm.tsx）",
		"表单验证逻辑（email 和 password）",
		"单元测试（LoginForm.test.tsx）",
	],
	whatWasLeftUndone: [
		"与后端 API 的集成（需要先实现后端接口）",
		"错误处理和用户反馈",
	],
	verification: {
		commandsRun: [
			{
				command: "pnpm test",
				exitCode: 0,
				observation: "所有单元测试通过",
			},
			{
				command: "pnpm run typecheck",
				exitCode: 0,
				observation: "TypeScript 类型检查通过",
			},
		],
		interactiveChecks: [
			{
				action: "在浏览器中打开登录页面",
				observed: "表单正确渲染，验证逻辑工作正常",
			},
		],
	},
	tests: {
		added: [
			{
				file: "src/components/LoginForm.test.tsx",
				cases: [
					{
						name: "validates email format",
						verifies: "VAL-001: 邮箱格式验证",
					},
					{
						name: "requires password",
						verifies: "VAL-002: 密码必填验证",
					},
				],
			},
		],
		coverage: "LoginForm 组件覆盖率 95%",
	},
	discoveredIssues: [
		{
			id: "ISSUE-001",
			severity: "blocking",
			category: "dependency_missing",
			description: "缺少 /api/v1/login 后端接口",
			context: "实现登录表单时发现后端接口不存在，无法完成提交逻辑",
			suggestedFix: "需要先实现后端登录接口（POST /api/v1/login）",
			affectedAssertions: ["VAL-001", "VAL-002"],
			discoveredAt: "2024-01-15T10:30:00.000Z",
		},
		{
			id: "ISSUE-002",
			severity: "warning",
			category: "architecture_conflict",
			description: "JWT 签名算法与现有系统不一致",
			context: "mission.md 要求使用 HS256，但现有系统使用 RS256",
			suggestedFix: "修改 mission.md 改用 RS256，或升级现有系统的 JWT 实现",
			discoveredAt: "2024-01-15T10:45:00.000Z",
		},
	],
	skillFeedback: {
		followedProcedure: true,
		deviations: [],
		suggestedChanges: [
			"建议在 skill 中添加后端依赖检查步骤",
			"建议在 mission.md 中明确 JWT 算法要求",
		],
	},
	createdAt: "2024-01-15T11:00:00.000Z",
};

/**
 * Mock Handoff 示例：无 discoveredIssues（向后兼容）
 */
export const mockHandoffWithoutIssues: Handoff = {
	id: "handoff-test-002",
	featureId: "feat-002",
	salientSummary: "实现用户仪表板页面",
	whatWasImplemented: [
		"仪表板 UI 组件（Dashboard.tsx）",
		"数据展示逻辑",
		"响应式布局",
	],
	whatWasLeftUndone: [],
	verification: {
		commandsRun: [
			{
				command: "pnpm test",
				exitCode: 0,
				observation: "所有测试通过",
			},
		],
		interactiveChecks: [
			{
				action: "在浏览器中查看仪表板",
				observed: "页面正确渲染，数据展示正常",
			},
		],
	},
	tests: {
		added: [
			{
				file: "src/components/Dashboard.test.tsx",
				cases: [
					{
						name: "renders dashboard",
						verifies: "仪表板组件正确渲染",
					},
				],
			},
		],
		coverage: "Dashboard 组件覆盖率 85%",
	},
	skillFeedback: {
		followedProcedure: true,
		deviations: [],
		suggestedChanges: [],
	},
	createdAt: "2024-01-15T12:00:00.000Z",
};

/**
 * Mock Handoff 示例：多个不同类型的 issues
 */
export const mockHandoffWithMultipleIssues: Handoff = {
	id: "handoff-test-003",
	featureId: "feat-003",
	salientSummary: "实现支付功能，发现多个架构和技术问题",
	whatWasImplemented: ["支付表单 UI", "基础验证逻辑"],
	whatWasLeftUndone: ["支付网关集成", "错误处理", "测试"],
	verification: {
		commandsRun: [],
		interactiveChecks: [],
	},
	tests: {
		added: [],
		coverage: "未添加测试",
	},
	discoveredIssues: [
		{
			id: "ISSUE-101",
			severity: "blocking",
			category: "dependency_missing",
			description: "缺少 Stripe SDK",
			context: "支付功能需要 Stripe SDK，但项目中未安装",
			suggestedFix: "运行 npm install stripe",
			discoveredAt: "2024-01-16T09:00:00.000Z",
		},
		{
			id: "ISSUE-102",
			severity: "blocking",
			category: "assertion_infeasible",
			description: "VAL-010 要求 PCI DSS 合规性，当前架构无法满足",
			context: "前端直接处理信用卡信息违反 PCI DSS 标准",
			suggestedFix: "使用 Stripe Elements 或 Checkout，避免前端接触敏感数据",
			affectedAssertions: ["VAL-010", "VAL-011"],
			discoveredAt: "2024-01-16T09:15:00.000Z",
		},
		{
			id: "ISSUE-103",
			severity: "warning",
			category: "scope_ambiguity",
			description: "mission.md 未明确支持的支付方式",
			context: "不清楚是否需要支持信用卡、PayPal、Apple Pay 等",
			suggestedFix: "在 mission.md 中明确列出支持的支付方式",
			discoveredAt: "2024-01-16T09:30:00.000Z",
		},
		{
			id: "ISSUE-104",
			severity: "info",
			category: "technical_constraint",
			description: "Stripe webhook 需要公网可访问的 URL",
			context: "开发环境需要使用 ngrok 或 Stripe CLI 进行测试",
			suggestedFix: "在开发文档中说明 webhook 测试方法",
			discoveredAt: "2024-01-16T09:45:00.000Z",
		},
	],
	skillFeedback: {
		followedProcedure: false,
		deviations: [
			{
				step: "实现支付逻辑",
				whatIDidInstead: "只实现了 UI，发现架构问题后停止",
				why: "发现架构问题需要重新设计",
			},
		],
		suggestedChanges: [
			"建议在 skill 中添加 PCI DSS 合规性检查",
			"建议在 mission.md template 中添加支付方式清单",
		],
	},
	createdAt: "2024-01-16T10:00:00.000Z",
};
