import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	WorktreeMergeConflictError,
	createWorktreeManager,
} from "../../src/worktree/manager.js";

const execFileAsync = promisify(execFile);

const IDENTITY = [
	"-c",
	"user.name=lazyforeman-test",
	"-c",
	"user.email=test@lazyforeman.local",
];

async function git(cwd: string, ...args: string[]): Promise<string> {
	const result = await execFileAsync("git", args, { cwd });
	return result.stdout.trim();
}

async function exists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function commitFile(
	cwd: string,
	file: string,
	content: string,
	message: string,
): Promise<void> {
	await fs.writeFile(path.join(cwd, file), content, "utf8");
	await git(cwd, ...IDENTITY, "add", file);
	await git(cwd, ...IDENTITY, "commit", "-m", message);
}

describe("worktree manager", () => {
	let tmpDir: string;
	let repoRoot: string;
	let worktreeRoot: string;
	let manager: ReturnType<typeof createWorktreeManager>;

	beforeEach(async () => {
		// 使用项目内的 .test-fixtures/ 而非 os.tmpdir()，避免 Windows 临时目录权限问题
		const fixturesRoot = path.join(process.cwd(), ".test-fixtures");
		await fs.mkdir(fixturesRoot, { recursive: true });
		tmpDir = await fs.mkdtemp(path.join(fixturesRoot, "worktree-"));
		repoRoot = path.join(tmpDir, "repo");
		worktreeRoot = path.join(tmpDir, "worktrees");

		await fs.mkdir(repoRoot, { recursive: true });
		await git(repoRoot, "init", "--initial-branch=main");
		await commitFile(repoRoot, "README.md", "# baseline\n", "chore: baseline");

		manager = createWorktreeManager({ repoRoot, worktreeRoot });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("creates an isolated worktree on its own branch", async () => {
		const worktreePath = await manager.createWorktree("feat-001");

		expect(worktreePath).toBe(path.join(worktreeRoot, "feat-001"));
		await expect(exists(worktreePath)).resolves.toBe(true);
		expect(await git(worktreePath, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
			"feature/feat-001",
		);

		// 主仓库仍停在 main，feature 分支独立存在
		expect(await git(repoRoot, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
			"main",
		);
		await expect(
			git(repoRoot, "rev-parse", "--verify", "refs/heads/feature/feat-001"),
		).resolves.toMatch(/^\w+$/);
	});

	it("reuses an existing worktree instead of failing on re-entry", async () => {
		const first = await manager.createWorktree("feat-001");
		const second = await manager.createWorktree("feat-001");

		expect(second).toBe(first);
		expect(await git(repoRoot, "worktree", "list", "--porcelain")).toMatch(
			/feat-001/,
		);
	});

	it("merges the feature branch back and cleans the worktree up", async () => {
		const worktreePath = await manager.createWorktree("feat-001");
		await commitFile(
			worktreePath,
			"feature.txt",
			"worker output\n",
			"feat: implement feat-001",
		);

		await manager.mergeWorktree("feat-001");
		await expect(exists(path.join(repoRoot, "feature.txt"))).resolves.toBe(
			true,
		);
		expect(await git(repoRoot, "log", "--oneline", "-1")).toMatch(/feat-001/);

		await manager.cleanupWorktree(worktreePath, false);
		await expect(exists(worktreePath)).resolves.toBe(false);
		const listed = await git(repoRoot, "worktree", "list", "--porcelain");
		expect(
			listed.split("\n").filter((line) => line.startsWith("worktree ")),
		).toHaveLength(1);
	});

	it("keeps the worktree when cleanup is asked to preserve it", async () => {
		const worktreePath = await manager.createWorktree("feat-002");
		await commitFile(
			worktreePath,
			"partial.txt",
			"unfinished\n",
			"wip: feat-002",
		);

		await manager.cleanupWorktree(worktreePath, true);

		await expect(exists(worktreePath)).resolves.toBe(true);
		await expect(
			git(worktreePath, "rev-parse", "--abbrev-ref", "HEAD"),
		).resolves.toBe("feature/feat-002");
	});

	it("throws WorktreeMergeConflictError and leaves the repo mid-merge-free", async () => {
		const worktreePath = await manager.createWorktree("feat-003");
		await commitFile(
			worktreePath,
			"shared.txt",
			"from worker\n",
			"feat: worker edit",
		);
		await commitFile(repoRoot, "shared.txt", "from main\n", "feat: main edit");

		await expect(manager.mergeWorktree("feat-003")).rejects.toThrow(
			WorktreeMergeConflictError,
		);

		await expect(
			exists(path.join(repoRoot, ".git", "MERGE_HEAD")),
		).resolves.toBe(false);
		expect(await git(repoRoot, "status", "--porcelain")).toBe("");
	});
});
