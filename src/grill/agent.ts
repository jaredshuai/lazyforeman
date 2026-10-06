/**
 * Grill Agent Implementation
 *
 * Implements the Grill-with-docs deep interview mechanism that generates
 * mission.md from rough goals through five-dimension drilling.
 *
 * Based on ADR-0003 §5 Grill-with-docs mechanism.
 */

import type { SqliteDb } from "../db/connection.js";
import type { WayfinderClient } from "../wayfinder/client.js";
import type {
	GrillMessage,
	GrillOptions,
	GrillSession,
	GrillSessionStatus,
} from "./types.js";
import {
	GRILL_SYSTEM_PROMPT,
	DIMENSION_PROMPTS,
	generateMissionSynthesisPrompt,
} from "./prompts.js";
import { GrillDimension } from "./types.js";

/**
 * Grill Agent interface
 */
export interface GrillAgent {
	/**
	 * Generate mission.md from rough goal through five-dimension drilling
	 *
	 * @param roughGoal - User's rough goal description
	 * @param options - Grill options (max turns, wayfinder, output path)
	 * @returns Generated mission.md content
	 */
	generateMission(roughGoal: string, options?: GrillOptions): Promise<string>;

	/**
	 * Save Grill session history to database
	 *
	 * @param sessionId - Unique session ID
	 * @param history - Conversation messages
	 */
	saveSession(sessionId: string, history: GrillMessage[]): Promise<void>;

	/**
	 * Load Grill session from database
	 *
	 * @param sessionId - Session ID to load
	 * @returns Session data or null if not found
	 */
	loadSession(sessionId: string): Promise<GrillSession | null>;
}

/**
 * LLM interface for Grill Agent
 *
 * Phase 2.2 uses mock implementation; Phase 3 will use real LLM.
 */
export interface LLMClient {
	/**
	 * Send message to LLM and get response
	 *
	 * @param messages - Conversation history
	 * @returns LLM response text
	 */
	chat(messages: GrillMessage[]): Promise<string>;
}

/**
 * Default Grill Agent implementation
 */
export class DefaultGrillAgent implements GrillAgent {
	constructor(
		private db: SqliteDb,
		private llm: LLMClient,
		private wayfinder?: WayfinderClient,
	) {}

	async generateMission(
		roughGoal: string,
		options: GrillOptions = {},
	): Promise<string> {
		const { maxTurns = 10, useWayfinder = false } = options;

		const sessionId = this.generateSessionId();
		const messages: GrillMessage[] = [
			{
				role: "system",
				content: GRILL_SYSTEM_PROMPT,
				timestamp: new Date(),
			},
			{
				role: "user",
				content: roughGoal,
				timestamp: new Date(),
			},
		];

		// Five-dimension drilling loop
		const dimensions = [
			GrillDimension.GOAL,
			GrillDimension.BOUNDARY,
			GrillDimension.TECHNICAL,
			GrillDimension.ACCEPTANCE,
			GrillDimension.RISK,
		];

		let currentDimensionIndex = 0;
		let turnCount = 0;

		while (currentDimensionIndex < dimensions.length && turnCount < maxTurns) {
			const dimension = dimensions[currentDimensionIndex];

			// Ask dimension-specific question
			const dimensionPrompt: GrillMessage = {
				role: "assistant",
				content: DIMENSION_PROMPTS[dimension],
				timestamp: new Date(),
			};
			messages.push(dimensionPrompt);

			// Get user response (via LLM in mock mode)
			const userResponse = await this.llm.chat(messages);
			messages.push({
				role: "user",
				content: userResponse,
				timestamp: new Date(),
			});

			// Check if dimension is complete (simplified for Phase 2.2)
			// Real implementation would analyze response quality
			currentDimensionIndex++;
			turnCount++;
		}

		// Generate mission.md from conversation history
		const conversationSummary = this.summarizeConversation(messages);
		const synthesisPrompt = generateMissionSynthesisPrompt(
			roughGoal,
			conversationSummary,
		);

		messages.push({
			role: "assistant",
			content: synthesisPrompt,
			timestamp: new Date(),
		});

		const missionMarkdown = await this.llm.chat(messages);

		// Save session
		await this.saveSessionInternal(
			sessionId,
			roughGoal,
			missionMarkdown,
			messages,
			"completed",
		);

		return missionMarkdown;
	}

	async saveSession(sessionId: string, history: GrillMessage[]): Promise<void> {
		const messagesJson = JSON.stringify(
			history.map((msg) => ({
				...msg,
				timestamp: msg.timestamp.toISOString(),
			})),
		);

		const stmt = this.db.prepare(`
			INSERT OR REPLACE INTO grill_sessions (id, rough_goal, generated_mission, messages_json, status, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		const roughGoal = history.find((m) => m.role === "user")?.content || "";
		stmt.run(
			sessionId,
			roughGoal,
			null, // generated_mission - not yet generated during session save
			messagesJson,
			"in_progress",
			new Date().toISOString(),
		);
	}

	async loadSession(sessionId: string): Promise<GrillSession | null> {
		const stmt = this.db.prepare(`
			SELECT id, rough_goal, generated_mission, messages_json, status, created_at, completed_at
			FROM grill_sessions
			WHERE id = ?
		`);

		const row = stmt.get(sessionId) as any;
		if (!row) {
			return null;
		}

		const messages: GrillMessage[] = JSON.parse(row.messages_json).map(
			(msg: any) => ({
				...msg,
				timestamp: new Date(msg.timestamp),
			}),
		);

		return {
			id: row.id,
			roughGoal: row.rough_goal,
			generatedMission: row.generated_mission,
			messages,
			status: row.status as GrillSessionStatus,
			createdAt: new Date(row.created_at),
			completedAt: row.completed_at ? new Date(row.completed_at) : null,
		};
	}

	private async saveSessionInternal(
		sessionId: string,
		roughGoal: string,
		generatedMission: string | null,
		messages: GrillMessage[],
		status: GrillSessionStatus,
	): Promise<void> {
		const messagesJson = JSON.stringify(
			messages.map((msg) => ({
				...msg,
				timestamp: msg.timestamp.toISOString(),
			})),
		);

		const now = new Date().toISOString();
		const completedAt = status === "completed" ? now : null;

		const stmt = this.db.prepare(`
			INSERT OR REPLACE INTO grill_sessions 
			(id, rough_goal, generated_mission, messages_json, status, created_at, completed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			sessionId,
			roughGoal,
			generatedMission,
			messagesJson,
			status,
			now,
			completedAt,
		);
	}

	private generateSessionId(): string {
		return `grill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private summarizeConversation(messages: GrillMessage[]): string {
		return messages
			.filter((m) => m.role !== "system")
			.map((m) => `${m.role}: ${m.content}`)
			.join("\n\n");
	}
}

/**
 * Factory function to create Grill Agent
 *
 * @param db - SQLite database connection
 * @param llm - LLM client (mock in Phase 2.2, real in Phase 3)
 * @param wayfinder - Optional Wayfinder client for architecture exploration
 * @returns Configured Grill Agent instance
 */
export function createGrillAgent(
	db: SqliteDb,
	llm: LLMClient,
	wayfinder?: WayfinderClient,
): GrillAgent {
	return new DefaultGrillAgent(db, llm, wayfinder);
}
