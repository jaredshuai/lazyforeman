import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { SqliteStepJournal } from "../../src/runtime/step-journal.js";

describe("SqliteStepJournal", () => {
	let db: SqliteDb;
	let journal: SqliteStepJournal;

	beforeEach(() => {
		db = openDatabase(":memory:");
		journal = new SqliteStepJournal(db);
	});

	afterEach(() => {
		db.close();
	});

	it("accepts an undefined step input as NULL", async () => {
		await journal.recordStepStart("wf-1", "createWorktree", undefined);

		const row = journal.getStep("wf-1", "createWorktree");
		expect(row?.status).toBe("started");
		expect(row?.input_json).toBeNull();
		expect(row?.completed_at).toBeNull();
	});

	it("returns successful steps through getCompletedSteps with their stored output", async () => {
		await journal.recordStepStart("wf-1", "createWorktree", undefined);
		await journal.recordStepSuccess("wf-1", "createWorktree", {
			path: "/tmp/wt/feat-001",
		});

		const completed = await journal.getCompletedSteps("wf-1");
		expect(completed.has("createWorktree")).toBe(true);
		expect(completed.get("createWorktree")).toEqual({
			path: "/tmp/wt/feat-001",
		});
	});

	it("treats failed and in-flight steps as not completed", async () => {
		await journal.recordStepStart("wf-1", "runOmp", undefined);
		await journal.recordStepFailure(
			"wf-1",
			"runOmp",
			new Error("transient boom"),
		);
		await journal.recordStepStart("wf-1", "saveHandoff", undefined);

		const completed = await journal.getCompletedSteps("wf-1");
		expect([...completed.keys()]).toEqual([]);

		const failed = journal.getStep("wf-1", "runOmp");
		expect(failed?.status).toBe("failed");
		expect(JSON.parse(failed?.error_json ?? "{}")).toMatchObject({
			message: "transient boom",
		});
		expect(failed?.completed_at).not.toBeNull();
	});

	it("reverts a step to started when it is re-executed after success", async () => {
		await journal.recordStepStart("wf-1", "runOmp", undefined);
		await journal.recordStepSuccess("wf-1", "runOmp", "handoff-001");

		await journal.recordStepStart("wf-1", "runOmp", undefined);

		const row = journal.getStep("wf-1", "runOmp");
		expect(row?.status).toBe("started");
		expect(row?.output_json).toBeNull();
		expect((await journal.getCompletedSteps("wf-1")).size).toBe(0);
	});

	it("keeps journals of different workflows apart", async () => {
		await journal.recordStepStart("wf-1", "runOmp", undefined);
		await journal.recordStepSuccess("wf-1", "runOmp", "a");
		await journal.recordStepStart("wf-2", "runOmp", undefined);

		expect((await journal.getCompletedSteps("wf-1")).size).toBe(1);
		expect((await journal.getCompletedSteps("wf-2")).size).toBe(0);
	});
});
