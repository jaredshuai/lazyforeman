import { z } from "zod";

/**
 * Handoff 契约（Zod schema，唯一事实源）
 *
 * Handoff 是 Worker 完成任务后的交接契约。schema 同时承担两个职责：
 * 1. 编译期类型来源（{@link Handoff}）
 * 2. 运行期对 omp 输出的校验（Pattern 2：schema 不合规即视为 worker 失败）
 */
export const HandoffSchema = z.object({
	/** Handoff 唯一标识符 */
	id: z.string().min(1),

	/** 关联的 Feature ID */
	featureId: z.string().min(1),

	/** 一句话索引 */
	salientSummary: z.string().min(1),

	/** 详细实现清单，至少一项 */
	whatWasImplemented: z.array(z.string()).min(1),

	/** 未完成项 */
	whatWasLeftUndone: z.array(z.string()),

	/** 验证记录 */
	verification: z.object({
		/** 执行的命令 */
		commandsRun: z.array(
			z.object({
				command: z.string(),
				exitCode: z.number(),
				observation: z.string(),
			}),
		),
		/** 交互式检查 */
		interactiveChecks: z.array(
			z.object({
				action: z.string(),
				observed: z.string(),
			}),
		),
	}),

	/** 测试记录 */
	tests: z.object({
		/** 新增的测试 */
		added: z.array(
			z.object({
				file: z.string(),
				cases: z.array(
					z.object({
						name: z.string(),
						verifies: z.string(),
					}),
				),
			}),
		),
		/** 覆盖率描述 */
		coverage: z.string(),
	}),

	/** Worker 发现的问题，可用于挑战契约 */
	discoveredIssues: z.array(
		z.object({
			severity: z.enum(["blocking", "non_blocking", "suggestion"]),
			description: z.string(),
			suggestedFix: z.string(),
		}),
	),

	/** Skill 反馈 */
	skillFeedback: z.object({
		followedProcedure: z.boolean(),
		deviations: z.array(
			z.object({
				step: z.string(),
				whatIDidInstead: z.string(),
				why: z.string(),
			}),
		),
		suggestedChanges: z.array(z.string()),
	}),

	/** 创建时间（ISO 8601） */
	createdAt: z.string().min(1),
});

/** Handoff 类型，由 {@link HandoffSchema} 推导 */
export type Handoff = z.infer<typeof HandoffSchema>;
