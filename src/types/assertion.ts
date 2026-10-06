/**
 * Assertion 类型定义
 *
 * Assertion 是验收断言，由 Feature 认领并由 Validator 验证。
 */

export interface Assertion {
	/** 断言唯一标识符 (VAL-*) */
	id: string;

	/** 断言描述 */
	description: string;

	/** 断言状态 */
	status: "pending" | "passed" | "failed";

	/** 认领此断言的 Feature ID */
	featureId?: string;

	/** 证据文件路径 */
	evidencePath?: string;

	/** 验证时间 */
	validatedAt?: string;

	/** 创建时间 */
	createdAt: string;

	/** 更新时间 */
	updatedAt: string;
}
