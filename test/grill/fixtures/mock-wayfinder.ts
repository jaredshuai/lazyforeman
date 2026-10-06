/**
 * Mock Wayfinder responses for testing
 */

import type { WayfinderResult } from "../../../src/types/wayfinder.js";

/**
 * Mock Wayfinder architecture exploration result
 */
export const mockWayfinderArchitecture: WayfinderResult = {
	query: "认证系统",
	tool: "codegraph",
	results: [
		{
			file: "src/auth/service.ts",
			snippet: "export class AuthService { ... }",
			lineRange: { start: 1, end: 50 },
			relevance: 0.95,
			context: "Authentication service implementation",
		},
		{
			file: "src/models/user.ts",
			snippet: "export interface User { ... }",
			lineRange: { start: 1, end: 30 },
			relevance: 0.9,
			context: "User model definition",
		},
		{
			file: "src/middleware/jwt.ts",
			snippet: "export const jwtMiddleware = ...",
			lineRange: { start: 1, end: 25 },
			relevance: 0.85,
			context: "JWT middleware for authentication",
		},
	],
	metadata: {
		totalResults: 3,
		searchTimeMs: 150,
		cached: false,
		rawOutput: "Mock codegraph output",
	},
};

/**
 * Mock empty Wayfinder result (no components found)
 */
export const mockWayfinderEmpty: WayfinderResult = {
	query: "nonexistent-component",
	tool: "codegraph",
	results: [],
	metadata: {
		totalResults: 0,
		searchTimeMs: 50,
		cached: false,
		rawOutput: "No results found",
	},
};

/**
 * Mock Wayfinder result with single component
 */
export const mockWayfinderSingleComponent: WayfinderResult = {
	query: "bcrypt",
	tool: "codebase-memory",
	results: [
		{
			file: "src/auth/hash.ts",
			snippet: "export async function hashPassword(password: string) { ... }",
			lineRange: { start: 10, end: 15 },
			relevance: 0.98,
			context: "Password hashing utility using bcrypt",
		},
	],
	metadata: {
		totalResults: 1,
		searchTimeMs: 80,
		cached: true,
		rawOutput: "Mock codebase-memory output",
	},
};

/**
 * Mock Wayfinder cached result
 */
export const mockWayfinderCached: WayfinderResult = {
	query: "cached-query",
	tool: "fast-context",
	results: [
		{
			file: "src/cached/component.ts",
			snippet: "// Cached component",
			relevance: 0.75,
		},
	],
	metadata: {
		totalResults: 1,
		searchTimeMs: 5,
		cached: true,
	},
};
