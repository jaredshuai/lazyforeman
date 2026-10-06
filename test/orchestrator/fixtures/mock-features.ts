import type { Feature } from "../../../src/types/feature.js";

/**
 * Mock features for testing
 */

export const mockOriginalFeature: Feature = {
	id: "feat-001",
	missionId: "mission-001",
	name: "实现登录表单",
	description: "前端登录表单实现",
	status: "in_progress",
	fulfills: ["VAL-001"],
	preconditions: [],
	currentWorkerSessionId: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

export const mockGeneratedFeature: Feature = {
	id: "feat-021",
	missionId: "mission-001",
	name: "实现后端登录接口",
	description:
		"实现依赖：缺少后端 API 接口\n\n上下文：实现登录功能时发现\n\n建议方案：先实现 POST /api/v1/login",
	status: "pending",
	fulfills: [],
	preconditions: [],
	currentWorkerSessionId: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

export const mockFeatureWithPreconditions: Feature = {
	id: "feat-002",
	missionId: "mission-001",
	name: "实现用户注册",
	description: "用户注册功能",
	status: "pending",
	fulfills: ["VAL-002"],
	preconditions: ["feat-001"],
	currentWorkerSessionId: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};
