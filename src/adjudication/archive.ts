/**
 * Decision Archive Module (feat-012)
 *
 * Archives adjudication results to filesystem per ADR-0003 §6.2
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { DiscoveredIssue } from "../types/handoff.js";
import type {
	AdjudicationResult,
	AdjudicationRound,
	Proposal,
} from "./types.js";

/**
 * Decision metadata
 */
export interface DecisionMetadata {
	missionId: string;
	issueId: string;
	timestamp: string;
	participants: number;
	duration: number; // milliseconds
}

/**
 * Archived round details
 */
export interface ArchivedRound {
	round: number;
	type: string;
	timestamp: string;
	outputs: unknown[];
}

/**
 * Complete archived decision
 */
export interface ArchivedDecision {
	metadata: DecisionMetadata;
	rounds: ArchivedRound[];
	outcome: AdjudicationResult;
}

/**
 * Decision Archive Interface
 */
export interface DecisionArchive {
	/**
	 * Archive adjudication result to filesystem
	 *
	 * @param missionId - Mission identifier
	 * @param issue - Issue being adjudicated
	 * @param result - Adjudication result
	 * @param startTime - When adjudication started (for duration calculation)
	 * @returns Path to archive directory
	 */
	archive(
		missionId: string,
		issue: DiscoveredIssue,
		result: AdjudicationResult,
		startTime: Date,
	): Promise<string>;
}

/**
 * Default implementation of DecisionArchive
 */
export class DefaultDecisionArchive implements DecisionArchive {
	constructor(private readonly baseDir: string = ".lazyforeman") {}

	async archive(
		missionId: string,
		issue: DiscoveredIssue,
		result: AdjudicationResult,
		startTime: Date,
	): Promise<string> {
		const archivePath = this.generateArchivePath(missionId, issue);

		// Create archive directory
		await fs.mkdir(archivePath, { recursive: true });

		const endTime = new Date();
		const duration = endTime.getTime() - startTime.getTime();

		// Write metadata
		await this.writeMetadata(archivePath, missionId, issue, result, duration);

		// Write each round
		for (const round of result.rounds) {
			await this.writeRound(archivePath, round);
		}

		// Write final outcome
		await this.writeOutcome(archivePath, result);

		// Generate human-readable README
		await this.writeReadme(archivePath, result, issue, missionId);

		return archivePath;
	}

	/**
	 * Generate archive directory path
	 */
	private generateArchivePath(
		missionId: string,
		issue: DiscoveredIssue,
	): string {
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.replace(/Z$/, "");
		const issueId = this.sanitizeIssueId(issue.id);

		return path.join(
			this.baseDir,
			"missions",
			missionId,
			"decisions",
			`${timestamp}-${issueId}`,
		);
	}

	/**
	 * Sanitize issue ID for filesystem
	 */
	private sanitizeIssueId(id: string | undefined): string {
		if (!id) {
			return "unknown-issue";
		}
		return id.toLowerCase().replace(/[^a-z0-9-]/g, "-");
	}

	/**
	 * Write metadata.json
	 */
	private async writeMetadata(
		archivePath: string,
		missionId: string,
		issue: DiscoveredIssue,
		result: AdjudicationResult,
		duration: number,
	): Promise<void> {
		const metadata: DecisionMetadata = {
			missionId,
			issueId: issue.id,
			timestamp: new Date().toISOString(),
			participants: result.allProposals.length,
			duration,
		};

		await fs.writeFile(
			path.join(archivePath, "metadata.json"),
			JSON.stringify(metadata, null, 2),
		);
	}

	/**
	 * Write round details to round-N.json
	 */
	private async writeRound(
		archivePath: string,
		round: AdjudicationRound,
	): Promise<void> {
		const roundPath = path.join(archivePath, `round-${round.round}.json`);

		await fs.writeFile(roundPath, JSON.stringify(round, null, 2));
	}

	/**
	 * Write outcome.json
	 */
	private async writeOutcome(
		archivePath: string,
		result: AdjudicationResult,
	): Promise<void> {
		await fs.writeFile(
			path.join(archivePath, "outcome.json"),
			JSON.stringify(result, null, 2),
		);
	}

	/**
	 * Generate human-readable README.md
	 */
	private async writeReadme(
		archivePath: string,
		result: AdjudicationResult,
		issue: DiscoveredIssue,
		missionId: string,
	): Promise<void> {
		const readme = this.generateReadme(result, issue, missionId);

		await fs.writeFile(path.join(archivePath, "README.md"), readme);
	}

	/**
	 * Generate README content
	 */
	private generateReadme(
		result: AdjudicationResult,
		issue: DiscoveredIssue,
		missionId: string,
	): string {
		const lines = [
			"# 裁决记录",
			"",
			"## 基本信息",
			"",
			`- **Mission**: ${missionId}`,
			`- **Issue ID**: ${issue.id}`,
			`- **Issue Category**: ${issue.category}`,
			`- **Issue Description**: ${issue.description}`,
			`- **Severity**: ${issue.severity}`,
			"",
			"## 裁决结果",
			"",
			`- **结果**: ${result.outcome}`,
			`- **胜出方案**: ${result.winner?.id || "N/A"}`,
			`- **参与者数量**: ${result.allProposals.length}`,
			"",
			"### 推理",
			"",
			result.reasoning,
			"",
		];

		// Add rounds summary
		lines.push("## 各轮详情", "");
		for (let i = 0; i < result.rounds.length; i++) {
			const round = result.rounds[i];
			lines.push(
				`### 第 ${round.round} 轮: ${round.type}`,
				"",
				`详情见 \`round-${round.round}.json\``,
				"",
			);
		}

		// Add all proposals
		lines.push("## 所有提案", "");
		for (const proposal of result.allProposals) {
			lines.push(
				`### ${proposal.id} (${proposal.participantId})`,
				"",
				`- **解决方案**: ${proposal.solution}`,
				`- **推理**: ${proposal.reasoning}`,
				`- **得票数**: ${proposal.votes}`,
				"",
			);
		}

		return lines.join("\n");
	}
}
