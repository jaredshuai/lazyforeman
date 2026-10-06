import type { Assertion } from "../../../src/types/assertion.js";

/**
 * Mock assertions for testing
 */

export const mockFeasibleAssertion: Assertion = {
	id: "VAL-001",
	description: "用户可以登录",
	status: "pending",
	type: "semantic",
	claimedBy: "feat-001",
	missionId: "mission-001",
	createdAt: "2026-10-06T10:00:00Z",
	updatedAt: "2026-10-06T10:00:00Z",
};

export const mockInfeasibleAssertion: Assertion = {
	id: "VAL-010",
	description: "支持 IE 11 浏览器",
	status: "infeasible",
	type: "deterministic",
	claimedBy: undefined,
	missionId: "mission-001",
	notes: "Worker 报告不可行: 现代框架不支持 IE 11",
	createdAt: "2026-10-06T10:00:00Z",
	updatedAt: "2026-10-06T11:00:00Z",
};

export const mockPendingAssertion: Assertion = {
	id: "VAL-002",
	description: "密码错误时显示清晰提示",
	status: "pending",
	type: "semantic",
	claimedBy: "feat-002",
	missionId: "mission-001",
	createdAt: "2026-10-06T10:00:00Z",
	updatedAt: "2026-10-06T10:00:00Z",
};

export const mockPassedAssertion: Assertion = {
	id: "VAL-003",
	description: "登录成功后跳转到主页",
	status: "passed",
	type: "deterministic",
	claimedBy: "feat-003",
	missionId: "mission-001",
	evidencePath: "/test/evidence/login-redirect.json",
	validatedAt: "2026-10-06T12:00:00Z",
	createdAt: "2026-10-06T10:00:00Z",
	updatedAt: "2026-10-06T12:00:00Z",
};

export const mockAnotherInfeasibleAssertion: Assertion = {
	id: "VAL-011",
	description: "支持 Safari 10",
	status: "infeasible",
	type: "deterministic",
	claimedBy: undefined,
	missionId: "mission-001",
	notes: "Worker 报告不可行: Safari 10 不支持 ES6",
	createdAt: "2026-10-06T10:00:00Z",
	updatedAt: "2026-10-06T11:00:00Z",
};
