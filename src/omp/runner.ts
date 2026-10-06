import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Handoff, HandoffSchema } from "../types/handoff.js";

const execFileAsync = promisify(execFile);

/** 真实 omp 调用的开关：默认关闭，保证门禁离线可复现（ADR-0001 Q4） */
function shouldUseRealOmp(): boolean {
	return process.env.USE_REAL_OMP === "true";
}

/** 真实 omp 单次运行上限 */
const OMP_TIMEOUT_MS = 600_000;

/**
 * 构造符合 {@link HandoffSchema} 的确定性 mock 交接物。
 *
 * @param featureId - 关联 feature
 */
export function buildMockHandoff(featureId: string): Handoff {
	return {
		id: `handoff-${featureId}`,
		featureId,
		salientSummary: `Mock implementation for ${featureId}`,
		whatWasImplemented: [`Implemented ${featureId} (mock)`],
		whatWasLeftUndone: [],
		verification: {
			commandsRun: [
				{ command: 'echo "mock"', exitCode: 0, observation: "Success" },
			],
			interactiveChecks: [],
		},
		tests: { added: [], coverage: "N/A (mock)" },
		discoveredIssues: [],
		skillFeedback: {
			followedProcedure: true,
			deviations: [],
			suggestedChanges: [],
		},
		createdAt: new Date().toISOString(),
	};
}

function buildPrompt(featureId: string, spec: string): string {
	return [
		`Implement the following feature (${featureId}):`,
		"",
		spec,
		"",
		"Respond with ONLY a JSON object conforming to the Handoff schema:",
		"id, featureId, salientSummary, whatWasImplemented, whatWasLeftUndone,",
		"verification{commandsRun[{command,exitCode,observation}],interactiveChecks[{action,observed}]},",
		"tests{added[{file,cases[{name,verifies}]}],coverage},",
		"discoveredIssues[{severity,description,suggestedFix}],",
		"skillFeedback{followedProcedure,deviations[{step,whatIDidInstead,why}],suggestedChanges},",
		"createdAt",
	].join("\n");
}

/**
 * 从 omp 的 stdout 中取出 Handoff 对象。
 *
 * `--mode json` 可能输出整个 JSON，也可能把 JSON 夹在会话消息/代码围栏里，
 * 因此按「整段解析 → 逐个平衡花括号候选解析」的顺序提取，并只接受能通过 schema 的对象。
 *
 * @param stdout - omp 标准输出
 */
export function extractHandoff(stdout: string): Handoff {
	const direct = stdout.trim();
	const parsedDirect = tryParseHandoff(direct);
	if (parsedDirect) return parsedDirect;

	for (const candidate of balancedObjects(stdout)) {
		const parsed = tryParseHandoff(candidate);
		if (parsed) return parsed;
	}

	throw new Error(
		`omp output contains no valid Handoff JSON: ${truncated(stdout)}`,
	);
}

function tryParseHandoff(text: string): Handoff | undefined {
	try {
		return HandoffSchema.parse(JSON.parse(text));
	} catch {
		return undefined;
	}
}

function* balancedObjects(text: string): Generator<string> {
	let examined = 0;

	for (let start = 0; start < text.length; start++) {
		if (text[start] !== "{") continue;
		if (examined++ >= 200) return;

		let depth = 0;
		let inString = false;
		let escaped = false;

		for (let i = start; i < text.length; i++) {
			const ch = text[i];
			if (inString) {
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === '"') inString = false;
				continue;
			}
			if (ch === '"') inString = true;
			else if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) {
					// 不跳过嵌套对象：外层可能是会话包装，真正的 handoff 在里层
					yield text.slice(start, i + 1);
					break;
				}
			}
		}
	}
}

function truncated(text: string): string {
	return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

/**
 * 在 worktree 内执行一个 feature，返回经过 schema 校验的 Handoff。
 *
 * 默认走确定性 mock（`USE_REAL_OMP` 未设为 `true` 时）；置为 `true` 则以
 * `omp -p --mode json` 非交互模式真实调用。
 *
 * @param worktreePath - 隔离 worktree 绝对路径
 * @param featureId - feature 标识
 * @param spec - feature 需求描述
 */
export async function runOmp(
	worktreePath: string,
	featureId: string,
	spec: string,
): Promise<Handoff> {
	if (!shouldUseRealOmp()) {
		const handoff = buildMockHandoff(featureId);
		console.log(`🤖 omp mock handoff for ${featureId}`);
		return handoff;
	}

	const { stdout } = await execFileAsync(
		"omp",
		[
			"-p",
			"--mode",
			"json",
			"--cwd",
			worktreePath,
			buildPrompt(featureId, spec),
		],
		{
			cwd: worktreePath,
			env: process.env,
			maxBuffer: 32 * 1024 * 1024,
			timeout: OMP_TIMEOUT_MS,
		},
	);

	const handoff = extractHandoff(stdout);
	console.log(`🤖 omp handoff validated for ${featureId}`);
	return handoff;
}
