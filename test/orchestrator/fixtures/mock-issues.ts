import type { DiscoveredIssue } from "../../../src/types/handoff.js";

/**
 * Mock discovered issues for testing
 */

export const mockBlockingDependencyIssue: DiscoveredIssue = {
	id: "ISSUE-001",
	severity: "blocking",
	category: "dependency_missing",
	description: "缺少后端 API 接口",
	context: "实现登录功能时发现",
	suggestedFix: "先实现 POST /api/v1/login",
	discoveredAt: new Date().toISOString(),
};

export const mockBlockingArchitectureIssue: DiscoveredIssue = {
	id: "ISSUE-002",
	severity: "blocking",
	category: "architecture_conflict",
	description: "JWT 算法不一致",
	context: "mission.md 要求 HS256，现有系统用 RS256",
	discoveredAt: new Date().toISOString(),
};

export const mockBlockingInfeasibleIssue: DiscoveredIssue = {
	id: "ISSUE-003",
	severity: "blocking",
	category: "assertion_infeasible",
	description: "VAL-002 无法实现：后端不区分错误类型",
	context: "密码错误提示需要后端支持",
	suggestedFix: "修改 VAL-002 或增加后端支持",
	affectedAssertions: ["VAL-002"],
	discoveredAt: new Date().toISOString(),
};

export const mockWarningIssue: DiscoveredIssue = {
	id: "ISSUE-004",
	severity: "warning",
	category: "technical_constraint",
	description: "性能可能有问题",
	context: "查询可能扫描全表",
	suggestedFix: "添加索引",
	discoveredAt: new Date().toISOString(),
};

export const mockInfoIssue: DiscoveredIssue = {
	id: "ISSUE-005",
	severity: "info",
	category: "scope_ambiguity",
	description: "输入验证规则不明确",
	context: "邮箱格式验证标准未定义",
	suggestedFix: "在 mission.md 中补充验证规则",
	discoveredAt: new Date().toISOString(),
};

export const mockBlockingScopeIssue: DiscoveredIssue = {
	id: "ISSUE-006",
	severity: "blocking",
	category: "scope_ambiguity",
	description: "需求定义模糊",
	context: "登录后跳转目标未定义",
	discoveredAt: new Date().toISOString(),
};

export const mockBlockingOtherIssue: DiscoveredIssue = {
	id: "ISSUE-007",
	severity: "blocking",
	category: "other",
	description: "未知类型的阻塞问题",
	context: "执行过程中遇到意外错误",
	discoveredAt: new Date().toISOString(),
};

/**
 * Vision conflict detection test issues
 */

export const mockIssueViolatesBoundary: DiscoveredIssue = {
	id: "ISSUE-010",
	severity: "blocking",
	category: "scope_ambiguity",
	description: "建议添加社交登录功能",
	context: "用户反馈希望支持 Google/Facebook 登录",
	suggestedFix: "实现 OAuth 2.0 社交登录",
	discoveredAt: new Date().toISOString(),
};

export const mockIssueViolatesConstraint: DiscoveredIssue = {
	id: "ISSUE-011",
	severity: "blocking",
	category: "technical_constraint",
	description: "PostgreSQL 性能不够，建议换 MongoDB",
	context: "查询慢",
	suggestedFix: "改用 MongoDB 替换 PostgreSQL",
	discoveredAt: new Date().toISOString(),
};

export const mockIssueMinorConflict: DiscoveredIssue = {
	id: "ISSUE-012",
	severity: "blocking",
	category: "technical_constraint",
	description: "密码加密算法需要调整",
	context: "当前使用 bcrypt，建议改为 Argon2",
	suggestedFix: "改为使用 Argon2 加密算法",
	discoveredAt: new Date().toISOString(),
};

export const mockIssueNoConflict: DiscoveredIssue = {
	id: "ISSUE-013",
	severity: "warning",
	category: "technical_constraint",
	description: "建议添加数据库索引",
	context: "users 表的 email 字段查询频繁",
	suggestedFix: "在 email 字段上创建索引",
	discoveredAt: new Date().toISOString(),
};

/**
 * Architecture conflict issue for Scenario 2 testing
 */
export const mockArchitectureConflictIssue: DiscoveredIssue = {
	id: "ISSUE-020",
	severity: "blocking",
	category: "architecture_conflict",
	description: "JWT 签名算法不一致",
	context: "mission.md 要求 HS256，现有系统使用 RS256",
	suggestedFix: "改用 RS256 保持与现有系统一致",
	discoveredAt: new Date().toISOString(),
};

/**
 * Infeasible assertion issues for Scenario 3 testing
 */
export const mockInfeasibleAssertionIssue: DiscoveredIssue = {
	id: "ISSUE-030",
	severity: "blocking",
	category: "assertion_infeasible",
	description: "断言 VAL-010 要求支持 IE 11，但现代框架已不支持",
	context: "使用 React 18 无法支持 IE 11",
	suggestedFix: "移除 IE 11 支持要求，或降级到 React 17",
	affectedAssertions: ["VAL-010"],
	discoveredAt: new Date().toISOString(),
};

export const mockMultipleInfeasibleIssue: DiscoveredIssue = {
	id: "ISSUE-031",
	severity: "blocking",
	category: "assertion_infeasible",
	description: "多个浏览器兼容性断言无法实现",
	context: "现代框架不支持旧版浏览器",
	suggestedFix: "移除旧版浏览器支持要求",
	affectedAssertions: ["VAL-010", "VAL-011"],
	discoveredAt: new Date().toISOString(),
};
