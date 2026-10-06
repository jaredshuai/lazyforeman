import type { MissionDocument } from "../../../src/types/mission-document.js";

/**
 * Mock mission document for testing vision conflict detection
 */
export const mockMissionDocument: MissionDocument = {
	name: "用户登录系统",
	background: [
		"当前系统没有用户认证功能",
		"需要支持用户注册和登录",
		"要求使用邮箱和密码认证",
	],
	goal: "实现一个安全的用户登录系统，支持邮箱密码认证",
	boundaries: {
		inScope: ["邮箱和密码登录", "密码加密存储", "登录错误提示", "会话管理"],
		outOfScope: [
			"社交登录（Google/Facebook/Twitter）",
			"短信验证码登录",
			"指纹/面部识别",
		],
	},
	successCriteria: [
		"用户可以用邮箱和密码注册",
		"用户可以用邮箱和密码登录",
		"密码必须加密存储",
		"密码错误时显示清晰提示",
	],
	architectureConstraints: [
		"必须使用 PostgreSQL 数据库",
		"必须使用 bcrypt 加密密码",
		"必须实现 JWT 会话管理",
		"后端使用 Node.js + Express",
	],
	risks: [
		{
			description: "密码加密强度不够",
			impact: "用户密码可能被破解",
			mitigation: "使用 bcrypt 且 cost factor ≥ 12",
		},
		{
			description: "登录尝试次数无限制",
			impact: "可能遭受暴力破解",
			mitigation: "实现登录限流机制",
		},
	],
	rawMarkdown: "# Mission: 用户登录系统\n...",
};

/**
 * Mock mission document with minimal boundaries (for testing edge cases)
 */
export const mockMissionDocumentMinimal: MissionDocument = {
	name: "简单功能",
	background: ["背景1", "背景2", "背景3"],
	goal: "实现简单功能",
	boundaries: {
		inScope: ["功能A"],
		outOfScope: ["功能B"],
	},
	successCriteria: ["标准1"],
	architectureConstraints: ["约束1"],
	risks: [{ description: "风险1" }],
	rawMarkdown: "# Mission: 简单功能\n...",
};
