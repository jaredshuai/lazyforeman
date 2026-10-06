/**
 * Feature 类型定义
 *
 * Feature 是可独立执行的任务单元，由 Worker 完成。
 */

export interface Feature {
	/** Feature 唯一标识符 */
	id: string;

	/** Feature 名称 */
	name: string;

	/** Feature 描述 */
	description: string;

	/** Feature 状态 */
	status: "pending" | "in_progress" | "completed" | "failed";

	/** 认领的断言 ID 列表 (VAL-*) */
	fulfills: string[];

	/** 前置依赖的 Feature ID 列表 */
	preconditions: string[];

	/** 当前 Worker 会话 ID */
	currentWorkerSessionId?: string;

	/** 创建时间 */
	createdAt: string;

	/** 更新时间 */
	updatedAt: string;
}
