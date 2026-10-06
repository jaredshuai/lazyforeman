import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** worktree 根目录；用环境变量覆盖，默认落在项目内 `.lazyforeman/worktrees/` */
export const WORKTREE_ROOT =
	process.env.LAZYFOREMAN_WORKTREE_ROOT ??
	path.join(process.cwd(), ".lazyforeman", "worktrees");

/** merge 冲突时抛出，交由 orchestrator 决定后续处理 */
export class WorktreeMergeConflictError extends Error {
	readonly branchName: string;

	constructor(branchName: string, details: string) {
		super(`merge of '${branchName}' conflicted: ${details}`);
		this.name = "WorktreeMergeConflictError";
		this.branchName = branchName;
	}
}

/** worktree 管理器的装配选项 */
export interface WorktreeManagerOptions {
	/** 主仓库根目录，默认当前进程 cwd */
	repoRoot?: string;
	/** worktree 存放根目录，默认 {@link WORKTREE_ROOT} */
	worktreeRoot?: string;
}

/** 单个 feature 的隔离工作区生命周期管理 */
export interface WorktreeManager {
	/** 由 featureId 得到约定分支名 */
	branchNameFor(featureId: string): string;
	/** 由 featureId 得到 worktree 绝对路径 */
	worktreePathFor(featureId: string): string;
	/** 创建（或复用）隔离 worktree，返回其绝对路径 */
	createWorktree(featureId: string): Promise<string>;
	/** 把 feature 分支合并回主仓库当前分支；冲突时抛 {@link WorktreeMergeConflictError} */
	mergeWorktree(featureId: string): Promise<void>;
	/** 移除 worktree；`keepOnFailure` 为 true 时保留目录供排障 */
	cleanupWorktree(worktreePath: string, keepOnFailure: boolean): Promise<void>;
}

function normalizePath(candidate: string): string {
	const resolved = path.resolve(candidate);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * 创建 worktree 管理器。
 *
 * 所有 git 调用都以参数数组发起（不拼接 shell 字符串），避免 featureId 或路径中的
 * 空格与特殊字符造成命令注入。
 *
 * @param options - 主仓库与 worktree 根目录
 */
export function createWorktreeManager(
	options: WorktreeManagerOptions = {},
): WorktreeManager {
	const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
	const worktreeRoot = path.resolve(options.worktreeRoot ?? WORKTREE_ROOT);

	async function git(args: string[]): Promise<string> {
		const result = await execFileAsync("git", args, {
			cwd: repoRoot,
			maxBuffer: 16 * 1024 * 1024,
		});
		return result.stdout;
	}

	async function listWorktreePaths(): Promise<Set<string>> {
		const stdout = await git(["worktree", "list", "--porcelain"]);
		const paths = new Set<string>();
		for (const line of stdout.split("\n")) {
			if (line.startsWith("worktree ")) {
				paths.add(normalizePath(line.slice("worktree ".length).trim()));
			}
		}
		return paths;
	}

	async function branchExists(branchName: string): Promise<boolean> {
		try {
			await git(["rev-parse", "--verify", `refs/heads/${branchName}`]);
			return true;
		} catch {
			return false;
		}
	}

	const branchNameFor = (featureId: string): string => `feature/${featureId}`;
	const worktreePathFor = (featureId: string): string =>
		path.join(worktreeRoot, featureId);

	return {
		branchNameFor,
		worktreePathFor,

		async createWorktree(featureId: string): Promise<string> {
			const branchName = branchNameFor(featureId);
			const worktreePath = worktreePathFor(featureId);

			// 确保 worktree 父目录存在
			await fs.mkdir(worktreeRoot, { recursive: true });

			// resume 场景下 createWorktree 可能重跑（上次崩在 'started' 残留态），
			// 因此已存在的 worktree 直接复用而不是让 git 报错。
			const existing = await listWorktreePaths();
			if (existing.has(normalizePath(worktreePath))) {
				console.warn(`📁 Worktree already present, reusing: ${worktreePath}`);
				return worktreePath;
			}

			if (await branchExists(branchName)) {
				await git(["worktree", "add", worktreePath, branchName]);
			} else {
				await git(["worktree", "add", "-b", branchName, worktreePath]);
			}

			console.log(`📁 Worktree created: ${worktreePath}`);
			return worktreePath;
		},

		async mergeWorktree(featureId: string): Promise<void> {
			const branchName = branchNameFor(featureId);

			try {
				const stdout = await git(["merge", "--no-ff", "--no-edit", branchName]);
				console.log(`🔀 Merged ${branchName}: ${stdout.trim().split("\n")[0]}`);
			} catch (error) {
				const details = error instanceof Error ? error.message : String(error);
				// 冲突会把主仓库留在 MERGE_HEAD 悬挂态，先 abort 复原，否则后续 run 全部被挡
				await git(["merge", "--abort"]).catch(() => undefined);
				throw new WorktreeMergeConflictError(branchName, details);
			}
		},

		async cleanupWorktree(
			worktreePath: string,
			keepOnFailure: boolean,
		): Promise<void> {
			if (keepOnFailure) {
				console.warn(`⚠️  Worktree preserved for debugging: ${worktreePath}`);
				console.warn(
					`   Clean up manually: git worktree remove ${worktreePath}`,
				);
				return;
			}

			try {
				await git(["worktree", "remove", "--force", worktreePath]);
			} catch {
				// 目录可能已被外部删除；prune 清掉悬空登记即可
				await git(["worktree", "prune"]);
				await fs.rm(worktreePath, { recursive: true, force: true });
			}

			console.log(`🗑️  Worktree cleaned up: ${worktreePath}`);
		},
	};
}

const defaultManager = createWorktreeManager();

/**
 * 用默认管理器创建 worktree。
 *
 * @param featureId - feature 标识
 */
export function createWorktree(featureId: string): Promise<string> {
	return defaultManager.createWorktree(featureId);
}

/**
 * 用默认管理器把 feature 分支合并回主仓库当前分支。
 *
 * @param featureId - feature 标识
 */
export function mergeWorktree(featureId: string): Promise<void> {
	return defaultManager.mergeWorktree(featureId);
}

/**
 * 用默认管理器清理 worktree。
 *
 * @param worktreePath - worktree 绝对路径
 * @param keepOnFailure - true 时保留目录供 fix feature 复用
 */
export function cleanupWorktree(
	worktreePath: string,
	keepOnFailure: boolean,
): Promise<void> {
	return defaultManager.cleanupWorktree(worktreePath, keepOnFailure);
}
