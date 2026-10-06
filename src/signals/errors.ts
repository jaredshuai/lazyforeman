/**
 * Signal 相关错误类型
 */

/**
 * Workflow 暂停错误
 *
 * 当 workflow 因等待 signal 解决而暂停时抛出此错误
 */
export class WorkflowPausedError extends Error {
	constructor(
		message: string,
		public readonly signalId?: string,
	) {
		super(message);
		this.name = "WorkflowPausedError";
	}
}
