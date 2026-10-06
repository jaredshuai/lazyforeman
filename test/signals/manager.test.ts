import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DefaultSignalManager } from "../../src/signals/manager.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import type { Signal } from "../../src/signals/types.js";

describe("DefaultSignalManager", () => {
	let db: SqliteDb;
	let signalManager: DefaultSignalManager;

	beforeEach(() => {
		db = openDatabase(":memory:");
		signalManager = new DefaultSignalManager(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("send()", () => {
		it("generates unique signal IDs", async () => {
			const signal1Id = await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Test conflict",
						recommendation: "require_user_decision",
					},
				},
			});

			const signal2Id = await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-002",
					issueId: "ISSUE-002",
					conflictDetails: {
						conflictLevel: "minor",
						reasoning: "Test conflict 2",
						recommendation: "multi_ai_adjudication",
					},
				},
			});

			expect(signal1Id).toBe("SIG-001");
			expect(signal2Id).toBe("SIG-002");
			expect(signal1Id).not.toBe(signal2Id);
		});

		it("persists signal to SQLite", async () => {
			const signalId = await signalManager.send({
				type: "user_clarification",
				status: "pending",
				payload: {
					featureId: "feat-003",
					issueId: "ISSUE-003",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Need clarification",
						recommendation: "require_user_decision",
					},
					suggestedActions: ["Option A", "Option B"],
				},
			});

			// Verify signal was persisted
			const row = db
				.prepare("SELECT * FROM signals WHERE id = ?")
				.get(signalId) as
				| {
						id: string;
						type: string;
						status: string;
						payload_json: string;
						created_at: string;
				  }
				| undefined;

			expect(row).toBeDefined();
			expect(row?.id).toBe(signalId);
			expect(row?.type).toBe("user_clarification");
			expect(row?.status).toBe("pending");

			const payload = JSON.parse(row!.payload_json);
			expect(payload.featureId).toBe("feat-003");
			expect(payload.issueId).toBe("ISSUE-003");
			expect(payload.suggestedActions).toEqual(["Option A", "Option B"]);
		});

		it("sets createdAt timestamp", async () => {
			const beforeSend = Date.now();
			const signalId = await signalManager.send({
				type: "manual_approval",
				status: "pending",
				payload: {
					featureId: "feat-004",
					issueId: "ISSUE-004",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Requires approval",
						recommendation: "require_user_decision",
					},
				},
			});
			const afterSend = Date.now();

			const signal = await signalManager.get(signalId);
			expect(signal).toBeDefined();
			expect(signal!.createdAt).toBeDefined();

			const createdAtTime = new Date(signal!.createdAt).getTime();
			expect(createdAtTime).toBeGreaterThanOrEqual(beforeSend);
			expect(createdAtTime).toBeLessThanOrEqual(afterSend);
		});
	});

	describe("listPending()", () => {
		it("returns empty array when no pending signals", async () => {
			const pending = await signalManager.listPending();
			expect(pending).toEqual([]);
		});

		it("returns all pending signals", async () => {
			// Send 3 signals
			await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Conflict 1",
						recommendation: "require_user_decision",
					},
				},
			});

			await signalManager.send({
				type: "user_clarification",
				status: "pending",
				payload: {
					featureId: "feat-002",
					issueId: "ISSUE-002",
					conflictDetails: {
						conflictLevel: "minor",
						reasoning: "Conflict 2",
						recommendation: "multi_ai_adjudication",
					},
				},
			});

			await signalManager.send({
				type: "manual_approval",
				status: "pending",
				payload: {
					featureId: "feat-003",
					issueId: "ISSUE-003",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Conflict 3",
						recommendation: "require_user_decision",
					},
				},
			});

			const pending = await signalManager.listPending();
			expect(pending).toHaveLength(3);
			expect(pending[0].id).toBe("SIG-001");
			expect(pending[1].id).toBe("SIG-002");
			expect(pending[2].id).toBe("SIG-003");
		});

		it("excludes resolved and abandoned signals", async () => {
			// Send a pending signal
			await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Conflict 1",
						recommendation: "require_user_decision",
					},
				},
			});

			// Manually mark one as resolved
			db.prepare(
				`INSERT INTO signals (id, type, status, payload_json, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
			).run(
				"SIG-999",
				"architecture_conflict",
				"resolved",
				JSON.stringify({
					featureId: "feat-999",
					issueId: "ISSUE-999",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Resolved",
						recommendation: "require_user_decision",
					},
				}),
				new Date().toISOString(),
				new Date().toISOString(),
			);

			const pending = await signalManager.listPending();
			expect(pending).toHaveLength(1);
			expect(pending[0].id).toBe("SIG-001");
		});

		it("orders signals by creation time ascending", async () => {
			// Send signals with slight delays
			const id1 = await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "First",
						recommendation: "require_user_decision",
					},
				},
			});

			// Wait a tiny bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			const id2 = await signalManager.send({
				type: "user_clarification",
				status: "pending",
				payload: {
					featureId: "feat-002",
					issueId: "ISSUE-002",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Second",
						recommendation: "require_user_decision",
					},
				},
			});

			const pending = await signalManager.listPending();
			expect(pending[0].id).toBe(id1);
			expect(pending[1].id).toBe(id2);
		});
	});

	describe("get()", () => {
		it("returns null for non-existent signal", async () => {
			const signal = await signalManager.get("SIG-999");
			expect(signal).toBeNull();
		});

		it("returns signal by ID", async () => {
			const signalId = await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Test conflict",
						recommendation: "require_user_decision",
					},
					suggestedActions: ["Action A", "Action B"],
				},
			});

			const signal = await signalManager.get(signalId);
			expect(signal).toBeDefined();
			expect(signal!.id).toBe(signalId);
			expect(signal!.type).toBe("architecture_conflict");
			expect(signal!.status).toBe("pending");
			expect(signal!.payload.featureId).toBe("feat-001");
			expect(signal!.payload.suggestedActions).toEqual([
				"Action A",
				"Action B",
			]);
		});

		it("parses resolved signal with resolution", async () => {
			// Manually insert a resolved signal
			const signalId = "SIG-001";
			db.prepare(
				`INSERT INTO signals (id, type, status, payload_json, created_at, resolved_at, resolution_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
			).run(
				signalId,
				"architecture_conflict",
				"resolved",
				JSON.stringify({
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Test",
						recommendation: "require_user_decision",
					},
				}),
				new Date().toISOString(),
				new Date().toISOString(),
				JSON.stringify({
					decision: "approve",
					reasoning: "User approved",
					resolvedBy: "user",
				}),
			);

			const signal = await signalManager.get(signalId);
			expect(signal).toBeDefined();
			expect(signal!.status).toBe("resolved");
			expect(signal!.resolvedAt).toBeDefined();
			expect(signal!.resolution).toBeDefined();
			expect(signal!.resolution!.decision).toBe("approve");
			expect(signal!.resolution!.resolvedBy).toBe("user");
		});
	});

	describe("checkTimeouts()", () => {
		it("returns empty array when no timeouts", async () => {
			// Send a recent signal
			await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Recent",
						recommendation: "require_user_decision",
					},
				},
			});

			const timeouts = await signalManager.checkTimeouts();
			expect(timeouts).toEqual([]);
		});

		it("marks signals older than 24 hours as abandoned", async () => {
			// Insert an old signal (25 hours ago)
			const oldTimestamp = new Date(
				Date.now() - 25 * 60 * 60 * 1000,
			).toISOString();
			db.prepare(
				`INSERT INTO signals (id, type, status, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
			).run(
				"SIG-OLD",
				"architecture_conflict",
				"pending",
				JSON.stringify({
					featureId: "feat-old",
					issueId: "ISSUE-old",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Old",
						recommendation: "require_user_decision",
					},
				}),
				oldTimestamp,
			);

			const timeouts = await signalManager.checkTimeouts();
			expect(timeouts).toEqual(["SIG-OLD"]);

			// Verify status changed to abandoned
			const signal = await signalManager.get("SIG-OLD");
			expect(signal!.status).toBe("abandoned");
		});

		it("does not mark recent signals as abandoned", async () => {
			// Insert a signal 23 hours ago (still within timeout)
			const recentTimestamp = new Date(
				Date.now() - 23 * 60 * 60 * 1000,
			).toISOString();
			db.prepare(
				`INSERT INTO signals (id, type, status, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
			).run(
				"SIG-RECENT",
				"architecture_conflict",
				"pending",
				JSON.stringify({
					featureId: "feat-recent",
					issueId: "ISSUE-recent",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Recent",
						recommendation: "require_user_decision",
					},
				}),
				recentTimestamp,
			);

			const timeouts = await signalManager.checkTimeouts();
			expect(timeouts).toEqual([]);

			const signal = await signalManager.get("SIG-RECENT");
			expect(signal!.status).toBe("pending");
		});

		it("marks multiple timeout signals", async () => {
			const oldTimestamp = new Date(
				Date.now() - 25 * 60 * 60 * 1000,
			).toISOString();

			// Insert 3 old signals
			for (let i = 1; i <= 3; i++) {
				db.prepare(
					`INSERT INTO signals (id, type, status, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
				).run(
					`SIG-OLD-${i}`,
					"architecture_conflict",
					"pending",
					JSON.stringify({
						featureId: `feat-${i}`,
						issueId: `ISSUE-${i}`,
						conflictDetails: {
							conflictLevel: "major",
							reasoning: "Old",
							recommendation: "require_user_decision",
						},
					}),
					oldTimestamp,
				);
			}

			const timeouts = await signalManager.checkTimeouts();
			expect(timeouts).toHaveLength(3);
			expect(timeouts).toContain("SIG-OLD-1");
			expect(timeouts).toContain("SIG-OLD-2");
			expect(timeouts).toContain("SIG-OLD-3");
		});
	});
});
