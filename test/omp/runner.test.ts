import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	buildMockHandoff,
	extractHandoff,
	runOmp,
} from "../../src/omp/runner.js";
import { HandoffSchema } from "../../src/types/handoff.js";

describe("omp runner", () => {
	let savedFlag: string | undefined;

	beforeEach(() => {
		savedFlag = process.env.USE_REAL_OMP;
		delete process.env.USE_REAL_OMP;
	});

	afterEach(() => {
		if (savedFlag === undefined) delete process.env.USE_REAL_OMP;
		else process.env.USE_REAL_OMP = savedFlag;
	});

	it("returns a schema-valid handoff without invoking the omp binary", async () => {
		const handoff = await runOmp(
			"/tmp/wt/feat-001",
			"feat-001",
			"Implement feature 001",
		);

		expect(() => HandoffSchema.parse(handoff)).not.toThrow();
		expect(handoff.featureId).toBe("feat-001");
		expect(handoff.whatWasImplemented.length).toBeGreaterThan(0);
	});

	it("rejects a handoff whose summary is empty", () => {
		const invalid = { ...buildMockHandoff("feat-001"), salientSummary: "" };
		expect(() => HandoffSchema.parse(invalid)).toThrow();
	});

	it("rejects an object that is not a handoff at all", () => {
		expect(() => HandoffSchema.parse({ id: "handoff-1" })).toThrow();
	});

	it("rejects an unknown issue severity", () => {
		const invalid = {
			...buildMockHandoff("feat-001"),
			discoveredIssues: [
				{ severity: "catastrophic", description: "d", suggestedFix: "f" },
			],
		};
		expect(() => HandoffSchema.parse(invalid)).toThrow();
	});
});

describe("extractHandoff", () => {
	it("parses a bare JSON document", () => {
		const handoff = buildMockHandoff("feat-001");
		expect(extractHandoff(JSON.stringify(handoff))).toEqual(handoff);
	});

	it("finds the handoff wrapped in prose and a code fence", () => {
		const handoff = buildMockHandoff("feat-002");
		const stdout = `Working on it.\n\`\`\`json\n${JSON.stringify(handoff, null, 2)}\n\`\`\`\nDone.`;
		expect(extractHandoff(stdout).id).toBe(handoff.id);
	});

	it("finds a handoff nested inside a session envelope", () => {
		const handoff = buildMockHandoff("feat-003");
		const stdout = JSON.stringify({
			type: "assistant",
			message: { content: handoff },
		});
		expect(extractHandoff(stdout).featureId).toBe("feat-003");
	});

	it("is not fooled by braces inside string values", () => {
		const handoff = {
			...buildMockHandoff("feat-004"),
			salientSummary: '{"nested": {"decoy": 1}}',
		};
		const stdout = `result: ${JSON.stringify(handoff)} trailing text {unbalanced`;
		const extracted = extractHandoff(stdout);
		expect(extracted.featureId).toBe("feat-004");
		expect(extracted.salientSummary).toBe('{"nested": {"decoy": 1}}');
	});

	it("throws when the output holds no valid handoff", () => {
		expect(() => extractHandoff("omp finished without JSON")).toThrow(
			/no valid Handoff/,
		);
	});
});
