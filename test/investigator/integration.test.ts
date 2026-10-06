/**
 * Investigator Agent integration tests
 *
 * Tests end-to-end flows including mission parsing and assertion extraction.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createInvestigatorAgent } from "../../src/investigator/agent.js";
import { createMissionParser } from "../../src/mission/parser.js";
import { openDatabase, type SqliteDb } from "../../src/db/connection.js";
import { exportAssertionsJson } from "../../src/investigator/agent.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Investigator Integration", () => {
	let db: SqliteDb;
	let tempDir: string;

	beforeEach(async () => {
		db = openDatabase(":memory:");
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "investigator-test-"));
	});

	afterEach(async () => {
		db.close();
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should parse mission.md and extract assertions", async () => {
		const missionMarkdown = `# Mission: User Authentication

## Background
- Current system has no authentication
- Users need secure access to their data
- Industry standard is email/password login

## Goal
Implement secure user authentication with email and password.

## Boundaries

### ✅ In Scope
- Email/password registration
- Login functionality
- Password hashing with bcrypt

### ❌ Out of Scope
- OAuth integration
- Two-factor authentication
- Social login

## Success Criteria
- [ ] Users can register with email and password
- [ ] Users can login with valid credentials
- [ ] All authentication tests pass
- [ ] Login interface is user-friendly

## Architecture Constraints
- Use bcrypt for password hashing (salt rounds >= 10)
- Store user credentials in PostgreSQL
- Use JWT for session tokens

## Risks
⚠️ **Password Storage**: Weak hashing could compromise user data
   - Impact: High - data breach
   - Mitigation: Use bcrypt with sufficient salt rounds
`;

		const parser = createMissionParser();
		const mission = parser.parse(missionMarkdown);

		const agent = createInvestigatorAgent(db);
		const result = await agent.extractAssertions(mission);

		expect(result.assertions).toHaveLength(4);
		expect(result.assertions[0].id).toBe("VAL-001");
		expect(result.assertions[0].description).toContain("register");
		expect(result.assertions[1].description).toContain("login");
		expect(result.assertions[2].description).toContain("tests pass");
		expect(result.assertions[2].type).toBe("deterministic");
		expect(result.assertions[3].description).toContain("user-friendly");
		expect(result.assertions[3].type).toBe("semantic");
	});

	it("should save to database and generate assertions.json file", async () => {
		const missionMarkdown = `# Mission: API Documentation

## Background
- API lacks proper documentation
- Developers struggle to integrate
- Need comprehensive API reference

## Goal
Create complete API documentation with examples.

## Boundaries

### ✅ In Scope
- REST API endpoints
- Request/response examples

### ❌ Out of Scope
- GraphQL documentation

## Success Criteria
- [ ] All endpoints are documented
- [ ] Examples compile and run successfully
- [ ] Documentation is clear and helpful

## Architecture Constraints
- Use OpenAPI 3.0 specification

## Risks
⚠️ **Maintenance**: Documentation may become outdated
`;

		const parser = createMissionParser();
		const mission = parser.parse(missionMarkdown);

		const agent = createInvestigatorAgent(db);
		const result = await agent.extractAssertions(mission);

		// Save to database
		const missionId = "mission-api-docs";

		// Create mission record first (foreign key requirement)
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run(
			missionId,
			"API Documentation",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		await agent.saveMissionMetadata(missionId, mission);
		await agent.saveAssertions(missionId, result.assertions);

		// Generate assertions.json
		const outputPath = path.join(tempDir, "assertions.json");
		await exportAssertionsJson(missionId, db, outputPath);

		// Verify file was created
		const fileContent = await fs.readFile(outputPath, "utf-8");
		const exported = JSON.parse(fileContent);

		expect(exported.assertions).toHaveLength(3);
		expect(exported.metadata.missionId).toBe(missionId);
		expect(exported.metadata.totalCount).toBe(3);
		expect(exported.assertions[0].id).toBe("VAL-001");
		expect(exported.assertions[1].id).toBe("VAL-002");
		expect(exported.assertions[2].id).toBe("VAL-003");
	});

	it("should handle mission with 20+ success criteria", async () => {
		const successCriteria = Array.from(
			{ length: 25 },
			(_, i) => `- [ ] Success criterion ${i + 1}`,
		).join("\n");

		const missionMarkdown = `# Mission: Large Feature Set

## Background
- Complex feature requiring many validations
- Multiple subsystems affected
- Comprehensive testing needed

## Goal
Implement large feature with extensive validation.

## Boundaries

### ✅ In Scope
- All 25 features

### ❌ Out of Scope
- Future enhancements

## Success Criteria
${successCriteria}

## Architecture Constraints
- Modular design required

## Risks
⚠️ **Complexity**: Large scope may delay delivery
`;

		const parser = createMissionParser();
		const mission = parser.parse(missionMarkdown);

		const agent = createInvestigatorAgent(db);
		const result = await agent.extractAssertions(mission);

		expect(result.assertions).toHaveLength(25);
		expect(result.metadata.totalGenerated).toBe(25);

		// Verify ID sequence
		expect(result.assertions[0].id).toBe("VAL-001");
		expect(result.assertions[9].id).toBe("VAL-010");
		expect(result.assertions[24].id).toBe("VAL-025");

		// Save and verify database integrity
		const missionId = "mission-large";

		// Create mission record first
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run(
			missionId,
			"Large Feature Set",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		await agent.saveMissionMetadata(missionId, mission);
		await agent.saveAssertions(missionId, result.assertions);

		const saved = db
			.prepare("SELECT COUNT(*) as count FROM assertions WHERE mission_id = ?")
			.get(missionId) as { count: number };

		expect(saved.count).toBe(25);

		// Verify export
		const outputPath = path.join(tempDir, "large-assertions.json");
		await exportAssertionsJson(missionId, db, outputPath);

		const exported = JSON.parse(await fs.readFile(outputPath, "utf-8"));
		expect(exported.assertions).toHaveLength(25);
		expect(exported.metadata.totalCount).toBe(25);
	});

	it("should handle mixed deterministic and semantic assertions", async () => {
		const missionMarkdown = `# Mission: E-commerce Checkout

## Background
- Current checkout flow is incomplete
- Need payment processing
- UX improvements required

## Goal
Complete checkout flow with payment and improved UX.

## Boundaries

### ✅ In Scope
- Payment gateway integration
- UI/UX improvements

### ❌ Out of Scope
- Cryptocurrency payments

## Success Criteria
- [ ] Payment processing tests pass
- [ ] All unit tests execute successfully
- [ ] Checkout UI is intuitive and professional
- [ ] User experience feels smooth
- [ ] Integration tests verify payment flow
- [ ] Design matches brand guidelines

## Architecture Constraints
- PCI compliance required

## Risks
⚠️ **Security**: Payment data must be protected
`;

		const parser = createMissionParser();
		const mission = parser.parse(missionMarkdown);

		const agent = createInvestigatorAgent(db);
		const result = await agent.extractAssertions(mission);

		expect(result.assertions).toHaveLength(6);

		// Count types
		const deterministicAssertions = result.assertions.filter(
			(a) => a.type === "deterministic",
		);
		const semanticAssertions = result.assertions.filter(
			(a) => a.type === "semantic",
		);

		expect(deterministicAssertions.length).toBeGreaterThan(0);
		expect(semanticAssertions.length).toBeGreaterThan(0);
		expect(result.metadata.deterministicCount).toBe(
			deterministicAssertions.length,
		);
		expect(result.metadata.semanticCount).toBe(semanticAssertions.length);

		// Verify classification
		expect(
			result.assertions.find((a) => a.description.includes("tests pass"))?.type,
		).toBe("deterministic");
		expect(
			result.assertions.find((a) => a.description.includes("intuitive"))?.type,
		).toBe("semantic");
	});

	it("should maintain traceability from mission.md to database", async () => {
		const missionMarkdown = `# Mission: Data Export

## Background
- Users need to export their data
- GDPR compliance requirement
- Multiple format support needed

## Goal
Enable users to export data in multiple formats.

## Boundaries

### ✅ In Scope
- CSV export
- JSON export

### ❌ Out of Scope
- PDF export

## Success Criteria
- [ ] CSV export generates valid files
- [ ] JSON export validates against schema
- [ ] Export UI is accessible

## Architecture Constraints
- Streaming for large datasets

## Risks
⚠️ **Performance**: Large exports may timeout
`;

		const parser = createMissionParser();
		const mission = parser.parse(missionMarkdown);

		const agent = createInvestigatorAgent(db);
		const result = await agent.extractAssertions(mission);

		const missionId = "mission-export";

		// Create mission record first
		db.prepare(
			"INSERT INTO missions (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).run(
			missionId,
			"Data Export",
			"pending",
			new Date().toISOString(),
			new Date().toISOString(),
		);

		await agent.saveMissionMetadata(missionId, mission);
		await agent.saveAssertions(missionId, result.assertions);

		// Verify traceability
		const assertions = db
			.prepare(
				"SELECT id, description, source_index FROM assertions WHERE mission_id = ? ORDER BY source_index",
			)
			.all(missionId) as Array<{
			id: string;
			description: string;
			source_index: number;
		}>;

		// Each assertion should map to original success criterion
		expect(assertions[0].source_index).toBe(0);
		expect(assertions[0].description).toBe(mission.successCriteria[0]);

		expect(assertions[1].source_index).toBe(1);
		expect(assertions[1].description).toBe(mission.successCriteria[1]);

		expect(assertions[2].source_index).toBe(2);
		expect(assertions[2].description).toBe(mission.successCriteria[2]);

		// Verify raw markdown is stored
		const metadata = db
			.prepare(
				"SELECT raw_markdown FROM missions_metadata WHERE mission_id = ?",
			)
			.get(missionId) as { raw_markdown: string };

		expect(metadata.raw_markdown).toBe(missionMarkdown);
	});
});
