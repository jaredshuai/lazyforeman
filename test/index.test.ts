import { describe, it, expect } from "vitest";
import type { Mission, Feature, Assertion, Handoff } from "../src/index.js";

describe("lazyforeman type exports", () => {
	it("should compile with Mission type", () => {
		const mission: Mission = {
			id: "test-mission",
			name: "Test Mission",
			description: "Test",
			status: "pending",
			features: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		expect(mission.id).toBe("test-mission");
	});

	it("should compile with Feature type", () => {
		const feature: Feature = {
			id: "test-feature",
			name: "Test Feature",
			description: "Test",
			status: "pending",
			fulfills: [],
			preconditions: [],
			missionId: "mission-001",
			currentWorkerSessionId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		expect(feature.id).toBe("test-feature");
	});

	it("should compile with Assertion type", () => {
		const assertion: Assertion = {
			id: "VAL-001",
			description: "Test assertion",
			status: "pending",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		expect(assertion.id).toBe("VAL-001");
	});

	it("should compile with Handoff type", () => {
		const handoff: Handoff = {
			id: "handoff-001",
			featureId: "feature-001",
			salientSummary: "Test summary",
			whatWasImplemented: [],
			whatWasLeftUndone: [],
			verification: {
				commandsRun: [],
				interactiveChecks: [],
			},
			tests: {
				added: [],
				coverage: "N/A",
			},
			discoveredIssues: [],
			skillFeedback: {
				followedProcedure: true,
				deviations: [],
				suggestedChanges: [],
			},
			createdAt: new Date().toISOString(),
		};
		expect(handoff.id).toBe("handoff-001");
	});
});
