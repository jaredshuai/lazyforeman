/**
 * Mission Parser Tests
 *
 * Comprehensive test suite for mission.md parsing and validation.
 */

import { describe, it, expect } from "vitest";
import {
	MarkdownMissionParser,
	createMissionParser,
} from "../../src/mission/parser.js";
import type { MissionDocument } from "../../src/types/mission-document.js";

describe("MarkdownMissionParser", () => {
	describe("parse", () => {
		it("parses a valid mission.md", () => {
			const markdown = `# Mission: User Authentication System

## 背景
- 当前系统没有认证
- 用户无法保护隐私
- 存在安全风险

## 目标
实现一个安全的认证系统，允许用户注册、登录和维护会话。

## 边界
✅ 邮箱密码注册
✅ 登录功能
❌ OAuth 社交登录
❌ 双因素认证

## 成功标准
- [ ] 用户可以用邮箱密码注册
- [ ] 密码使用 bcrypt 加密存储
- [ ] 用户可以用正确凭证登录

## 架构约束
- 后端: Node.js/Express (现有)
- 数据库: PostgreSQL (现有)
- 使用 bcrypt 包

## 风险
⚠️ 风险 1: 密码哈希性能
- 影响: 高流量可能减慢登录
⚠️ 风险 2: 会话存储可扩展性
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.name).toBe("User Authentication System");
			expect(doc.background).toHaveLength(3);
			expect(doc.goal).toContain("认证系统");
			expect(doc.boundaries.inScope).toHaveLength(2);
			expect(doc.boundaries.outOfScope).toHaveLength(2);
			expect(doc.successCriteria).toHaveLength(3);
			expect(doc.architectureConstraints).toHaveLength(3);
			expect(doc.risks).toHaveLength(2);
			expect(doc.rawMarkdown).toBe(markdown);
		});

		it("extracts mission name from heading", () => {
			const markdown = `# Mission: Test Mission Name

## 背景
- Item 1
- Item 2
- Item 3

## 目标
Test goal

## 边界
✅ Item 1
❌ Item 2

## 成功标准
- Criterion 1

## 架构约束
- Constraint 1

## 风险
⚠️ Risk 1
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.name).toBe("Test Mission Name");
		});

		it("parses background as array of sentences", () => {
			const markdown = `# Mission: Test

## 背景
- First background item
- Second background item
- Third background item
- Fourth item

## 目标
Goal

## 边界
✅ Item
❌ Item

## 成功标准
- Criterion

## 架构约束
- Constraint

## 风险
⚠️ Risk
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.background).toEqual([
				"First background item",
				"Second background item",
				"Third background item",
				"Fourth item",
			]);
		});

		it("parses goal as single string", () => {
			const markdown = `# Mission: Test

## 背景
- Item 1
- Item 2
- Item 3

## 目标
Implement a secure authentication system that allows users to register, login, and maintain sessions.

## 边界
✅ Item
❌ Item

## 成功标准
- Criterion

## 架构约束
- Constraint

## 风险
⚠️ Risk
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.goal).toBe(
				"Implement a secure authentication system that allows users to register, login, and maintain sessions.",
			);
		});

		it("separates in-scope and out-of-scope items", () => {
			const markdown = `# Mission: Test

## 背景
- Item 1
- Item 2
- Item 3

## 目标
Goal

## 边界
✅ Email/password registration
✅ Login functionality
✅ Session management
❌ OAuth social login
❌ Two-factor authentication
❌ Password reset

## 成功标准
- Criterion

## 架构约束
- Constraint

## 风险
⚠️ Risk
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.boundaries.inScope).toEqual([
				"Email/password registration",
				"Login functionality",
				"Session management",
			]);
			expect(doc.boundaries.outOfScope).toEqual([
				"OAuth social login",
				"Two-factor authentication",
				"Password reset",
			]);
		});

		it("extracts success criteria", () => {
			const markdown = `# Mission: Test

## 背景
- Item 1
- Item 2
- Item 3

## 目标
Goal

## 边界
✅ Item
❌ Item

## 成功标准
- [ ] User can register with email and password
- [ ] Password is hashed before storage
- [x] User can login with correct credentials
- User can logout

## 架构约束
- Constraint

## 风险
⚠️ Risk
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.successCriteria).toEqual([
				"User can register with email and password",
				"Password is hashed before storage",
				"User can login with correct credentials",
				"User can logout",
			]);
		});

		it("extracts architecture constraints", () => {
			const markdown = `# Mission: Test

## 背景
- Item 1
- Item 2
- Item 3

## 目标
Goal

## 边界
✅ Item
❌ Item

## 成功标准
- Criterion

## 架构约束
- Backend: Node.js/Express (existing)
- Database: PostgreSQL (existing)
- Use bcrypt package (already in package.json)
- Session store: Redis

## 风险
⚠️ Risk
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.architectureConstraints).toEqual([
				"Backend: Node.js/Express (existing)",
				"Database: PostgreSQL (existing)",
				"Use bcrypt package (already in package.json)",
				"Session store: Redis",
			]);
		});

		it("parses risks with ⚠️ marker", () => {
			const markdown = `# Mission: Test

## 背景
- Item 1
- Item 2
- Item 3

## 目标
Goal

## 边界
✅ Item
❌ Item

## 成功标准
- Criterion

## 架构约束
- Constraint

## 风险
⚠️ Risk 1: Password hashing performance
- 影响: High traffic may slow down login
- 缓解: Use bcrypt work factor 10
⚠️ Risk 2: Session storage scalability
- Impact: In-memory sessions won't scale
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.risks).toHaveLength(2);
			expect(doc.risks[0]).toEqual({
				description: "Password hashing performance",
				impact: "High traffic may slow down login",
				mitigation: "Use bcrypt work factor 10",
			});
			expect(doc.risks[1]).toEqual({
				description: "Session storage scalability",
				impact: "In-memory sessions won't scale",
			});
		});

		it("handles English section names", () => {
			const markdown = `# Mission: Test Mission

## Background
- Current system state
- User pain points
- Technical status

## Goal
Achieve something great

## Boundary
✅ Do this
❌ Don't do that

## Success Criteria
- Criterion 1

## Architecture Constraints
- Constraint 1

## Risks
⚠️ Risk 1
`;

			const parser = new MarkdownMissionParser();
			const doc = parser.parse(markdown);

			expect(doc.background).toHaveLength(3);
			expect(doc.goal).toContain("great");
			expect(doc.boundaries.inScope).toHaveLength(1);
			expect(doc.boundaries.outOfScope).toHaveLength(1);
		});

		it("throws error when mission name is missing", () => {
			const markdown = `## 背景
- Item 1
- Item 2
- Item 3
`;

			const parser = new MarkdownMissionParser();

			expect(() => parser.parse(markdown)).toThrow("Mission name not found");
		});
	});

	describe("validate", () => {
		it("passes validation for a complete mission", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["First sentence", "Second sentence", "Third sentence"],
				goal: "Achieve something",
				boundaries: {
					inScope: ["Item 1"],
					outOfScope: ["Item 2"],
				},
				successCriteria: ["Criterion 1"],
				architectureConstraints: ["Constraint 1"],
				risks: [{ description: "Risk 1" }],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(true);
			expect(result.violations).toHaveLength(0);
		});

		it("fails when background has less than 3 sentences", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["Only one sentence"],
				goal: "Goal",
				boundaries: {
					inScope: ["Item"],
					outOfScope: ["Item"],
				},
				successCriteria: ["Criterion"],
				architectureConstraints: ["Constraint"],
				risks: [{ description: "Risk" }],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(false);
			expect(result.violations).toHaveLength(1);
			expect(result.violations[0]).toEqual({
				field: "background",
				rule: "minimum-sentences",
				message: "Background must have at least 3 sentences, found 1",
			});
		});

		it("fails when boundaries have no ✅ items", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["One", "Two", "Three"],
				goal: "Goal",
				boundaries: {
					inScope: [],
					outOfScope: ["Item"],
				},
				successCriteria: ["Criterion"],
				architectureConstraints: ["Constraint"],
				risks: [{ description: "Risk" }],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(false);
			expect(
				result.violations.some((v) => v.field === "boundaries.inScope"),
			).toBe(true);
		});

		it("fails when boundaries have no ❌ items", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["One", "Two", "Three"],
				goal: "Goal",
				boundaries: {
					inScope: ["Item"],
					outOfScope: [],
				},
				successCriteria: ["Criterion"],
				architectureConstraints: ["Constraint"],
				risks: [{ description: "Risk" }],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(false);
			expect(
				result.violations.some((v) => v.field === "boundaries.outOfScope"),
			).toBe(true);
		});

		it("fails when architecture constraints are empty", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["One", "Two", "Three"],
				goal: "Goal",
				boundaries: {
					inScope: ["Item"],
					outOfScope: ["Item"],
				},
				successCriteria: ["Criterion"],
				architectureConstraints: [],
				risks: [{ description: "Risk" }],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(false);
			expect(
				result.violations.some((v) => v.field === "architectureConstraints"),
			).toBe(true);
		});

		it("fails when risks are empty", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["One", "Two", "Three"],
				goal: "Goal",
				boundaries: {
					inScope: ["Item"],
					outOfScope: ["Item"],
				},
				successCriteria: ["Criterion"],
				architectureConstraints: ["Constraint"],
				risks: [],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(false);
			expect(result.violations.some((v) => v.field === "risks")).toBe(true);
		});

		it("returns multiple violations when multiple gates fail", () => {
			const doc: MissionDocument = {
				name: "Test Mission",
				background: ["Only one"],
				goal: "Goal",
				boundaries: {
					inScope: [],
					outOfScope: [],
				},
				successCriteria: ["Criterion"],
				architectureConstraints: [],
				risks: [],
				rawMarkdown: "",
			};

			const parser = new MarkdownMissionParser();
			const result = parser.validate(doc);

			expect(result.valid).toBe(false);
			expect(result.violations.length).toBeGreaterThan(3);
		});
	});

	describe("createMissionParser", () => {
		it("creates a parser instance", () => {
			const parser = createMissionParser();
			expect(parser).toBeDefined();
			expect(parser.parse).toBeDefined();
			expect(parser.validate).toBeDefined();
		});
	});
});
