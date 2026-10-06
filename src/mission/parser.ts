/**
 * Mission Parser Implementation
 *
 * Parses mission.md markdown files into structured MissionDocument objects
 * and validates them against ADR-0003 quality gates.
 *
 * Uses simple regex-based parsing (no external markdown libraries for Phase 2.1).
 */

import type {
	MissionDocument,
	ValidationResult,
} from "../types/mission-document.js";

/**
 * Mission Parser interface
 */
export interface MissionParser {
	/**
	 * Parse mission.md markdown to structured document
	 *
	 * @param markdown - Raw mission.md content
	 * @returns Parsed mission document
	 * @throws {Error} if markdown is malformed
	 */
	parse(markdown: string): MissionDocument;

	/**
	 * Validate mission document against ADR-0003 quality gates
	 *
	 * Quality gates:
	 * - Background: ≥3 sentences
	 * - Boundary: ≥1 ✅ and ≥1 ❌
	 * - Architecture constraints: not empty
	 * - Risks: ≥1 ⚠️
	 *
	 * @param doc - Parsed mission document
	 * @returns Validation result with specific violations
	 */
	validate(doc: MissionDocument): ValidationResult;
}

/**
 * Markdown-based Mission Parser implementation
 *
 * Uses regex patterns to extract sections from markdown without
 * external dependencies.
 */
export class MarkdownMissionParser implements MissionParser {
	parse(markdown: string): MissionDocument {
		// Extract mission name from heading
		const name = this.extractMissionName(markdown);

		// Extract sections
		const sections = this.extractSections(markdown);

		// Parse each section
		const background = this.parseBackground(sections.background || "");
		const goal = this.parseGoal(sections.goal || "");
		const boundaries = this.parseBoundaries(sections.boundaries || "");
		const successCriteria = this.parseSuccessCriteria(
			sections.successCriteria || "",
		);
		const architectureConstraints = this.parseArchitectureConstraints(
			sections.architectureConstraints || "",
		);
		const risks = this.parseRisks(sections.risks || "");

		return {
			name,
			background,
			goal,
			boundaries,
			successCriteria,
			architectureConstraints,
			risks,
			rawMarkdown: markdown,
		};
	}

	validate(doc: MissionDocument): ValidationResult {
		const violations: ValidationResult["violations"] = [];

		// Quality gate 1: Background ≥3 sentences
		if (doc.background.length < 3) {
			violations.push({
				field: "background",
				rule: "minimum-sentences",
				message: `Background must have at least 3 sentences, found ${doc.background.length}`,
			});
		}

		// Quality gate 2: Boundaries have ≥1 ✅ and ≥1 ❌
		if (doc.boundaries.inScope.length === 0) {
			violations.push({
				field: "boundaries.inScope",
				rule: "minimum-items",
				message: "Boundaries must have at least 1 in-scope item (✅)",
			});
		}

		if (doc.boundaries.outOfScope.length === 0) {
			violations.push({
				field: "boundaries.outOfScope",
				rule: "minimum-items",
				message: "Boundaries must have at least 1 out-of-scope item (❌)",
			});
		}

		// Quality gate 3: Architecture constraints not empty
		if (doc.architectureConstraints.length === 0) {
			violations.push({
				field: "architectureConstraints",
				rule: "not-empty",
				message: "Architecture constraints must not be empty",
			});
		}

		// Quality gate 4: Risks ≥1
		if (doc.risks.length === 0) {
			violations.push({
				field: "risks",
				rule: "minimum-items",
				message: "Risks must have at least 1 item (⚠️)",
			});
		}

		return {
			valid: violations.length === 0,
			violations,
		};
	}

	/**
	 * Extract mission name from # Mission: <name> heading
	 */
	private extractMissionName(markdown: string): string {
		const match = markdown.match(/^#\s+Mission:\s*(.+)$/m);
		if (!match) {
			throw new Error(
				"Mission name not found. Expected '# Mission: <name>' heading",
			);
		}
		return match[1].trim();
	}

	/**
	 * Extract sections by ## headers
	 */
	private extractSections(markdown: string): Record<string, string> {
		const sections: Record<string, string> = {};

		// Split by ## headers
		const sectionPattern = /^##\s+(.+)$/gm;
		const matches = [...markdown.matchAll(sectionPattern)];

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];
			const sectionName = match[1].trim();
			const matchIndex = match.index ?? 0;
			const startIndex = matchIndex + match[0].length;
			const endIndex = matches[i + 1]?.index ?? markdown.length;
			const content = markdown.slice(startIndex, endIndex).trim();

			// Map Chinese and English section names
			const normalizedName = this.normalizeSectionName(sectionName);
			sections[normalizedName] = content;
		}

		return sections;
	}

	/**
	 * Normalize section names to internal keys
	 */
	private normalizeSectionName(name: string): string {
		const lowerName = name.toLowerCase();

		if (lowerName.includes("背景") || lowerName === "background") {
			return "background";
		}
		if (lowerName.includes("目标") || lowerName === "goal") {
			return "goal";
		}
		if (lowerName.includes("边界") || lowerName === "boundary") {
			return "boundaries";
		}
		if (lowerName.includes("成功标准") || lowerName === "success criteria") {
			return "successCriteria";
		}
		if (
			lowerName.includes("架构约束") ||
			lowerName === "architecture constraints"
		) {
			return "architectureConstraints";
		}
		if (lowerName.includes("风险") || lowerName === "risks") {
			return "risks";
		}

		return name;
	}

	/**
	 * Parse background as array of sentences
	 */
	private parseBackground(content: string): string[] {
		const sentences: string[] = [];

		// Split by list items or newlines
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Remove list markers (-, *, +)
			const cleaned = trimmed.replace(/^[-*+]\s+/, "");
			if (cleaned) {
				sentences.push(cleaned);
			}
		}

		return sentences;
	}

	/**
	 * Parse goal as single string
	 */
	private parseGoal(content: string): string {
		// Take first non-empty line or paragraph
		const lines = content.split("\n").filter((l) => l.trim());
		return lines.join(" ").trim();
	}

	/**
	 * Parse boundaries into in-scope and out-of-scope
	 */
	private parseBoundaries(content: string): {
		inScope: string[];
		outOfScope: string[];
	} {
		const inScope: string[] = [];
		const outOfScope: string[] = [];

		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Match ✅ or "做:" or "Do:"
			if (trimmed.match(/^[✅✓]/)) {
				const cleaned = trimmed
					.replace(/^[✅✓]\s*/, "")
					.replace(/^(做|Do):?\s*/i, "");
				if (cleaned) inScope.push(cleaned);
			}
			// Match ❌ or "不做:" or "Don't:"
			else if (trimmed.match(/^[❌✗]/)) {
				const cleaned = trimmed
					.replace(/^[❌✗]\s*/, "")
					.replace(/^(不做|Don't|Dont):?\s*/i, "");
				if (cleaned) outOfScope.push(cleaned);
			}
			// List items after "做:" or "不做:" headers
			else if (trimmed.match(/^[-*+]\s+/)) {
				const cleaned = trimmed.replace(/^[-*+]\s+/, "");
				// Determine scope based on previous context or content
				if (cleaned) {
					// Heuristic: if line is within the context, add to appropriate list
					// For now, we'll require explicit markers
				}
			}
		}

		return { inScope, outOfScope };
	}

	/**
	 * Parse success criteria list items
	 */
	private parseSuccessCriteria(content: string): string[] {
		const criteria: string[] = [];
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Match checkbox items or list items
			const cleaned = trimmed
				.replace(/^[-*+]\s*/, "")
				.replace(/^\[\s*[xX ]?\s*]\s*/, "");

			if (cleaned) {
				criteria.push(cleaned);
			}
		}

		return criteria;
	}

	/**
	 * Parse architecture constraints list items
	 */
	private parseArchitectureConstraints(content: string): string[] {
		const constraints: string[] = [];
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Remove list markers
			const cleaned = trimmed.replace(/^[-*+]\s*/, "");
			if (cleaned) {
				constraints.push(cleaned);
			}
		}

		return constraints;
	}

	/**
	 * Parse risks with ⚠️ marker
	 */
	private parseRisks(content: string): Array<{
		description: string;
		impact?: string;
		mitigation?: string;
	}> {
		const risks: Array<{
			description: string;
			impact?: string;
			mitigation?: string;
		}> = [];

		const lines = content.split("\n");
		let currentRisk: {
			description: string;
			impact?: string;
			mitigation?: string;
		} | null = null;

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Match risk marker (⚠️ or "Risk")
			// Note: ⚠️ emoji may include variation selector (U+FE0F)
			// Use alternation instead of character class for combining characters
			if (trimmed.match(/^(?:\u26A0\uFE0F?|\u26A1)+\s*/)) {
				// Save previous risk
				if (currentRisk) {
					risks.push(currentRisk);
				}

				// Start new risk - remove emoji and "Risk N:" prefix
				const cleaned = trimmed
					.replace(/^(?:\u26A0\uFE0F?|\u26A1|\s)+/, "")
					.replace(/^(Risk|风险)\s*\d*:?\s*/i, "");
				currentRisk = { description: cleaned };
			}
			// Match impact or mitigation sub-items
			else if (currentRisk && trimmed.match(/^[-*+]\s+/)) {
				const cleaned = trimmed.replace(/^[-*+]\s*/, "");
				if (cleaned.match(/^(Impact|影响):/i)) {
					currentRisk.impact = cleaned.replace(/^(Impact|影响):\s*/i, "");
				} else if (cleaned.match(/^(Mitigation|缓解):/i)) {
					currentRisk.mitigation = cleaned.replace(
						/^(Mitigation|缓解):\s*/i,
						"",
					);
				}
			}
		}

		// Save last risk
		if (currentRisk) {
			risks.push(currentRisk);
		}

		return risks;
	}
}

/**
 * Create a mission parser instance
 */
export function createMissionParser(): MissionParser {
	return new MarkdownMissionParser();
}

/**
 * Convenience function to parse and validate mission markdown
 *
 * @param markdown - Raw mission.md content
 * @returns Validation result with parsed document (if valid)
 */
export function parseMissionMarkdown(markdown: string): ValidationResult & {
	document?: MissionDocument;
} {
	const parser = createMissionParser();

	try {
		const document = parser.parse(markdown);
		const validationResult = parser.validate(document);

		return {
			...validationResult,
			document,
		};
	} catch (error) {
		return {
			valid: false,
			violations: [
				{
					field: "markdown",
					rule: "parsing",
					message:
						error instanceof Error ? error.message : "Failed to parse markdown",
				},
			],
		};
	}
}
