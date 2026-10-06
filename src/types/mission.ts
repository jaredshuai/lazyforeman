/**
 * Mission 类型定义
 *
 * Mission 是最顶层的编排单元，包含多个 Feature。
 */

export interface Mission {
	/** Mission 唯一标识符 */
	id: string;

	/** Mission 名称 */
	name: string;

	/** Mission 描述 */
	description: string;

	/** Mission 状态 */
	status: "pending" | "in_progress" | "completed" | "failed";

	/** Feature 列表 */
	features: string[];

	/** 创建时间 */
	createdAt: string;

	/** 更新时间 */
	updatedAt: string;
}
