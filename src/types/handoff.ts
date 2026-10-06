/**
 * Handoff 类型定义
 *
 * Handoff 是 Worker 完成任务后的交接契约。
 */

export interface Handoff {
	/** Handoff 唯一标识符 */
	id: string;

	/** 关联的 Feature ID */
	featureId: string;

	/** 一句话索引 */
	salientSummary: string;

	/** 详细实现清单 */
	whatWasImplemented: string[];

	/** 未完成项 */
	whatWasLeftUndone: string[];

	/** 验证记录 */
	verification: {
		/** 执行的命令 */
		commandsRun: Array<{
			command: string;
			exitCode: number;
			observation: string;
		}>;
		/** 交互式检查 */
		interactiveChecks: Array<{
			action: string;
			observed: string;
		}>;
	};

	/** 测试记录 */
	tests: {
		/** 新增的测试 */
		added: Array<{
			file: string;
			cases: Array<{
				name: string;
				verifies: string; // VAL-* ID
			}>;
		}>;
		/** 覆盖率描述 */
		coverage: string;
	};

	/** 发现的问题 */
	discoveredIssues: Array<{
		severity: "blocking" | "non_blocking" | "suggestion";
		description: string;
		suggestedFix: string;
	}>;

	/** Skill 反馈 */
	skillFeedback: {
		followedProcedure: boolean;
		deviations: Array<{
			step: string;
			whatIDidInstead: string;
			why: string;
		}>;
		suggestedChanges: string[];
	};

	/** 创建时间 */
	createdAt: string;
}
