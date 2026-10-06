import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DefaultSignalManager } from "../../src/signals/manager.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { WorkflowPausedError } from "../../src/signals/errors.js";
import type { Signal } from "../../src/signals/types.js";

describe("Signal Integration", () => {
	let db: SqliteDb;
	let signalManager: DefaultSignalManager;

	beforeEach(() => {
		db = openDatabase(":memory:");
		signalManager = new DefaultSignalManager(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("End-to-end signal workflow", () => {
		it("sends signal → persists → queries successfully", async () => {
			// 1. Send signal
			const signalId = await signalManager.send({
				type: "architecture_conflict",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "JWT algorithm mismatch",
						recommendation: "require_user_decision",
					},
					suggestedActions: ["Update mission.md", "Upgrade existing system"],
				},
			});

			// 2. Verify signal was persisted
			expect(signalId).toBe("SIG-001");

			// 3. Query by ID
			const signal = await signalManager.get(signalId);
			expect(signal).toBeDefined();
			expect(signal!.id).toBe(signalId);
			expect(signal!.type).toBe("architecture_conflict");
			expect(signal!.status).toBe("pending");
			expect(signal!.payload.featureId).toBe("feat-001");
			expect(signal!.payload.conflictDetails.conflictLevel).toBe("major");

			// 4. Verify appears in pending list
			const pending = await signalManager.listPending();
			expect(pending).toHaveLength(1);
			expect(pending[0].id).toBe(signalId);
		});

		it("handles multiple signals in sequence", async () => {
			const signals: Signal[] = [];

			// Send 5 signals
			for (let i = 1; i <= 5; i++) {
				const signalId = await signalManager.send({
					type: "architecture_conflict",
					status: "pending",
					payload: {
						featureId: `feat-${i.toString().padStart(3, "0")}`,
						issueId: `ISSUE-${i.toString().padStart(3, "0")}`,
						conflictDetails: {
							conflictLevel: i % 2 === 0 ? "major" : "minor",
							reasoning: `Conflict ${i}`,
							recommendation: "require_user_decision",
						},
					},
				});

				const signal = await signalManager.get(signalId);
				signals.push(signal!);
			}

			// Verify all signals
			expect(signals).toHaveLength(5);
			expect(signals.map((s) => s.id)).toEqual([
				"SIG-001",
				"SIG-002",
				"SIG-003",
				"SIG-004",
				"SIG-005",
			]);

			// Verify pending list
			const pending = await signalManager.listPending();
			expect(pending).toHaveLength(5);
		});

		it("signal persists across manager instances", async () => {
			// Send signal with first manager
			const signalId = await signalManager.send({
				type: "user_clarification",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Need clarification",
						recommendation: "require_user_decision",
					},
				},
			});

			// Create new manager with same DB
			const newManager = new DefaultSignalManager(db);

			// Query with new manager
			const signal = await newManager.get(signalId);
			expect(signal).toBeDefined();
			expect(signal!.id).toBe(signalId);
			expect(signal!.type).toBe("user_clarification");

			const pending = await newManager.listPending();
			expect(pending).toHaveLength(1);
		});
	});

	describe("WorkflowPausedError", () => {
		it("can be thrown with signal ID", () => {
			const error = new WorkflowPausedError(
				"Waiting for signal resolution",
				"SIG-001",
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(WorkflowPausedError);
			expect(error.name).toBe("WorkflowPausedError");
			expect(error.message).toBe("Waiting for signal resolution");
			expect(error.signalId).toBe("SIG-001");
		});

		it("can be thrown without signal ID", () => {
			const error = new WorkflowPausedError("Workflow paused");

			expect(error.signalId).toBeUndefined();
		});

		it("can be caught and inspected", async () => {
			// Simulate workflow that sends signal and throws
			async function simulateWorkflow(): Promise<void> {
				const signalId = await signalManager.send({
					type: "architecture_conflict",
					status: "pending",
					payload: {
						featureId: "feat-001",
						issueId: "ISSUE-001",
						conflictDetails: {
							conflictLevel: "major",
							reasoning: "Conflict detected",
							recommendation: "require_user_decision",
						},
					},
				});

				throw new WorkflowPausedError(
					"Workflow paused for signal resolution",
					signalId,
				);
			}

			// Catch and verify error
			try {
				await simulateWorkflow();
				expect.fail("Should have thrown WorkflowPausedError");
			} catch (error) {
				expect(error).toBeInstanceOf(WorkflowPausedError);
				const pausedError = error as WorkflowPausedError;
				expect(pausedError.signalId).toBe("SIG-001");

				// Verify signal was persisted
				const signal = await signalManager.get(pausedError.signalId!);
				expect(signal).toBeDefined();
				expect(signal!.status).toBe("pending");
			}
		});
	});

	describe("Signal lifecycle", () => {
		it("tracks signal from creation to timeout", async () => {
			// 1. Create signal
			const signalId = await signalManager.send({
				type: "manual_approval",
				status: "pending",
				payload: {
					featureId: "feat-001",
					issueId: "ISSUE-001",
					conflictDetails: {
						conflictLevel: "major",
						reasoning: "Requires approval",
						recommendation: "require_user_decision",
					},
				},
			});

			// 2. Verify initial state
			let signal = await signalManager.get(signalId);
			expect(signal!.status).toBe("pending");
			expect(signal!.resolvedAt).toBeUndefined();

			// 3. Manually age the signal (simulate 25 hours passing)
			db.prepare(`UPDATE signals SET created_at = ? WHERE id = ?`).run(
				new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
				signalId,
			);

			// 4. Run timeout check
			const timeouts = await signalManager.checkTimeouts();
			expect(timeouts).toContain(signalId);

			// 5. Verify final state
			signal = await signalManager.get(signalId);
			expect(signal!.status).toBe("abandoned");
		});

		it("handles concurrent signal operations", async () => {
			// Send multiple signals concurrently
			const promises = Array.from({ length: 10 }, (_, i) =>
				signalManager.send({
					type: "architecture_conflict",
					status: "pending",
					payload: {
						featureId: `feat-${i}`,
						issueId: `ISSUE-${i}`,
						conflictDetails: {
							conflictLevel: "major",
							reasoning: `Concurrent ${i}`,
							recommendation: "require_user_decision",
						},
					},
				}),
			);

			const signalIds = await Promise.all(promises);

			// Verify all signals were created with unique IDs
			expect(new Set(signalIds).size).toBe(10);

			// Verify all are pending
			const pending = await signalManager.listPending();
			expect(pending).toHaveLength(10);
		});
	});

	describe("Database constraints", () => {
		it("enforces status CHECK constraint", () => {
			expect(() =>
				db
					.prepare(
						`INSERT INTO signals (id, type, status, payload_json, created_at)
             VALUES (?, ?, ?, ?, ?)`,
					)
					.run(
						"SIG-BAD",
						"architecture_conflict",
						"invalid_status",
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
					),
			).toThrow(/CHECK/i);
		});

		it("requires non-null fields", () => {
			expect(() =>
				db
					.prepare(
						`INSERT INTO signals (id, type, status, payload_json, created_at)
             VALUES (?, ?, ?, ?, ?)`,
					)
					.run("SIG-NULL", null, "pending", "{}", new Date().toISOString()),
			).toThrow(/NOT NULL/i);
		});

		it("enforces PRIMARY KEY constraint", async () => {
			// Insert first signal
			db.prepare(
				`INSERT INTO signals (id, type, status, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
			).run(
				"SIG-DUP",
				"architecture_conflict",
				"pending",
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
			);

			// Try to insert duplicate
			expect(() =>
				db
					.prepare(
						`INSERT INTO signals (id, type, status, payload_json, created_at)
             VALUES (?, ?, ?, ?, ?)`,
					)
					.run(
						"SIG-DUP",
						"architecture_conflict",
						"pending",
						JSON.stringify({
							featureId: "feat-002",
							issueId: "ISSUE-002",
							conflictDetails: {
								conflictLevel: "major",
								reasoning: "Test 2",
								recommendation: "require_user_decision",
							},
						}),
						new Date().toISOString(),
					),
			).toThrow(/PRIMARY KEY|UNIQUE/i);
		});
	});

	describe("Query performance", () => {
		it("uses indexes for pending queries", async () => {
			// Insert many signals
			for (let i = 0; i < 100; i++) {
				await signalManager.send({
					type: "architecture_conflict",
					status: "pending",
					payload: {
						featureId: `feat-${i}`,
						issueId: `ISSUE-${i}`,
						conflictDetails: {
							conflictLevel: "major",
							reasoning: `Test ${i}`,
							recommendation: "require_user_decision",
						},
					},
				});
			}

			// Query should be fast with index
			const start = Date.now();
			const pending = await signalManager.listPending();
			const duration = Date.now() - start;

			expect(pending).toHaveLength(100);
			expect(duration).toBeLessThan(100); // Should be very fast with index
		});
	});
});
