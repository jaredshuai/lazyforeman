import { describe, expect, it } from "vitest";
import {
	DiscoveredIssueSchema,
	HandoffSchema,
} from "../../src/types/handoff.js";

describe("DiscoveredIssue Schema", () => {
	describe("valid inputs", () => {
		it("should validate a valid blocking issue", () => {
			const validIssue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Backend API endpoint missing",
				context:
					"Attempting to implement login form but /api/v1/login does not exist",
				suggestedFix: "Implement POST /api/v1/login endpoint first",
				affectedAssertions: ["VAL-001", "VAL-002"],
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(validIssue);
			expect(result.success).toBe(true);
		});

		it("should validate a warning issue without optional fields", () => {
			const validIssue = {
				id: "ISSUE-002",
				severity: "warning",
				category: "architecture_conflict",
				description: "JWT algorithm mismatch detected",
				context: "mission.md requires HS256 but existing system uses RS256",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(validIssue);
			expect(result.success).toBe(true);
		});

		it("should validate an info issue", () => {
			const validIssue = {
				id: "ISSUE-003",
				severity: "info",
				category: "other",
				description: "Consider using React Query for data fetching",
				context: "Current implementation uses manual fetch calls",
				suggestedFix: "Install and configure @tanstack/react-query",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(validIssue);
			expect(result.success).toBe(true);
		});
	});

	describe("severity validation", () => {
		it("should accept 'blocking' severity", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(true);
		});

		it("should accept 'warning' severity", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "warning",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(true);
		});

		it("should accept 'info' severity", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "info",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(true);
		});

		it("should reject invalid severity", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "critical",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});
	});

	describe("category validation", () => {
		const categories = [
			"dependency_missing",
			"architecture_conflict",
			"assertion_infeasible",
			"scope_ambiguity",
			"technical_constraint",
			"other",
		];

		for (const category of categories) {
			it(`should accept '${category}' category`, () => {
				const issue = {
					id: "ISSUE-001",
					severity: "blocking",
					category,
					description: "Valid description here",
					context: "Valid context here",
					discoveredAt: new Date().toISOString(),
				};

				const result = DiscoveredIssueSchema.safeParse(issue);
				expect(result.success).toBe(true);
			});
		}

		it("should reject invalid category", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "invalid_category",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});
	});

	describe("ID format validation", () => {
		it("should accept valid ID format ISSUE-001", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(true);
		});

		it("should accept ISSUE-999", () => {
			const issue = {
				id: "ISSUE-999",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(true);
		});

		it("should reject ID without leading zeros (ISSUE-1)", () => {
			const issue = {
				id: "ISSUE-1",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});

		it("should reject ID with more than 3 digits", () => {
			const issue = {
				id: "ISSUE-0001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});

		it("should reject ID with wrong prefix", () => {
			const issue = {
				id: "BUG-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});
	});

	describe("description and context validation", () => {
		it("should reject description shorter than 10 characters", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Too short",
				context: "Valid context here",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});

		it("should reject context shorter than 10 characters", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Too short",
				discoveredAt: new Date().toISOString(),
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});
	});

	describe("datetime validation", () => {
		it("should accept valid ISO 8601 datetime", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: "2024-01-01T12:00:00.000Z",
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(true);
		});

		it("should reject invalid datetime format", () => {
			const issue = {
				id: "ISSUE-001",
				severity: "blocking",
				category: "dependency_missing",
				description: "Valid description here",
				context: "Valid context here",
				discoveredAt: "2024-01-01",
			};

			const result = DiscoveredIssueSchema.safeParse(issue);
			expect(result.success).toBe(false);
		});
	});
});

describe("Handoff Schema with discoveredIssues", () => {
	it("should validate Handoff with discoveredIssues", () => {
		const handoff = {
			id: "handoff-001",
			featureId: "feat-001",
			salientSummary: "Implemented login form",
			whatWasImplemented: ["Login form UI", "Form validation"],
			whatWasLeftUndone: ["Backend integration"],
			verification: {
				commandsRun: [
					{
						command: "pnpm test",
						exitCode: 0,
						observation: "All tests passed",
					},
				],
				interactiveChecks: [
					{
						action: "Opened login page",
						observed: "Form renders correctly",
					},
				],
			},
			tests: {
				added: [
					{
						file: "src/login.test.ts",
						cases: [
							{
								name: "validates email format",
								verifies: "Email validation works",
							},
						],
					},
				],
				coverage: "90% line coverage",
			},
			discoveredIssues: [
				{
					id: "ISSUE-001",
					severity: "blocking",
					category: "dependency_missing",
					description: "Backend API endpoint missing",
					context:
						"Attempting to implement login form but /api/v1/login does not exist",
					suggestedFix: "Implement POST /api/v1/login endpoint first",
					affectedAssertions: ["VAL-001"],
					discoveredAt: new Date().toISOString(),
				},
			],
			skillFeedback: {
				followedProcedure: true,
				deviations: [],
				suggestedChanges: [],
			},
			createdAt: new Date().toISOString(),
		};

		const result = HandoffSchema.safeParse(handoff);
		expect(result.success).toBe(true);
	});

	it("should validate Handoff without discoveredIssues (optional field)", () => {
		const handoff = {
			id: "handoff-002",
			featureId: "feat-002",
			salientSummary: "Implemented dashboard",
			whatWasImplemented: ["Dashboard UI"],
			whatWasLeftUndone: [],
			verification: {
				commandsRun: [],
				interactiveChecks: [],
			},
			tests: {
				added: [],
				coverage: "No tests added",
			},
			skillFeedback: {
				followedProcedure: true,
				deviations: [],
				suggestedChanges: [],
			},
			createdAt: new Date().toISOString(),
		};

		const result = HandoffSchema.safeParse(handoff);
		expect(result.success).toBe(true);
	});

	it("should validate Handoff with empty discoveredIssues array", () => {
		const handoff = {
			id: "handoff-003",
			featureId: "feat-003",
			salientSummary: "Implemented settings page",
			whatWasImplemented: ["Settings UI"],
			whatWasLeftUndone: [],
			verification: {
				commandsRun: [],
				interactiveChecks: [],
			},
			tests: {
				added: [],
				coverage: "No tests added",
			},
			discoveredIssues: [],
			skillFeedback: {
				followedProcedure: true,
				deviations: [],
				suggestedChanges: [],
			},
			createdAt: new Date().toISOString(),
		};

		const result = HandoffSchema.safeParse(handoff);
		expect(result.success).toBe(true);
	});

	it("should reject Handoff with invalid discoveredIssue", () => {
		const handoff = {
			id: "handoff-004",
			featureId: "feat-004",
			salientSummary: "Implemented feature",
			whatWasImplemented: ["Something"],
			whatWasLeftUndone: [],
			verification: {
				commandsRun: [],
				interactiveChecks: [],
			},
			tests: {
				added: [],
				coverage: "No tests",
			},
			discoveredIssues: [
				{
					id: "INVALID",
					severity: "blocking",
					category: "dependency_missing",
					description: "Short",
					context: "Short",
					discoveredAt: new Date().toISOString(),
				},
			],
			skillFeedback: {
				followedProcedure: true,
				deviations: [],
				suggestedChanges: [],
			},
			createdAt: new Date().toISOString(),
		};

		const result = HandoffSchema.safeParse(handoff);
		expect(result.success).toBe(false);
	});
});
