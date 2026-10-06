# Phase 2.1 Architecture: Contract Layer Implementation

**Status**: Draft  
**Date**: 2026-10-06  
**Author**: Architecture Design Agent  
**Basis**: ADR-0003, Phase 1 Infrastructure Analysis

---

## Executive Summary

Phase 2.1 implements the contract layer that bridges mission specifications to executable features. This architecture leverages Phase 1's durable execution foundation (step journal + workflow runner + SQLite) and introduces four core modules:

1. **Mission Parser**: Markdown → structured MissionDocument
2. **Investigator Agent**: MissionDocument → assertions.json (assertion extraction)
3. **Planner Agent**: MissionDocument + assertions → features.json (task breakdown + DAG)
4. **Coverage Validator**: Pre-work gate ensuring 100% assertion coverage

**Key Innovation**: Assertion ledger as first-class citizen with hard gate preventing work from starting until every assertion is claimed by exactly one feature.

---

## 1. Codebase Analysis Findings

### 1.1 Tools Used

**1. codegraph___codegraph_explore** (146 nodes, 408 edges):
- Analyzed workflow patterns: `WorkflowContext`, `runStep`, step journal semantics
- Identified Phase 1 types: `Handoff`, `Feature`, `Mission`, `Assertion` (basic shapes)
- Found infrastructure: SQLite step journal, workflow runner, worktree manager

**2. codebase-memory-mcp___get_architecture** (169 nodes, 249 edges):
- Architecture layers: db (entry), runtime (leaf), workflows (entry), worktree (leaf), omp (leaf)
- 5 cohesive clusters with clear boundaries (workflows → worktree/runtime/omp)
- Hotspots: `git` helper (5 fan-in), `runStep` workflow primitive

**3. codebase-memory-mcp___search_graph**:
- Found existing types: `Assertion`, `Mission`, `Feature`, `Handoff`, `ProgressEvent`
- Assertion type already has `featureId` field (ready for claiming)
- Feature type already has `fulfills: string[]` field (ready for assertion IDs)

### 1.2 Key Infrastructure Patterns

**Durable Execution Pattern** (`src/runtime/workflow-runner.ts`):
```typescript
// Phase 1 established this pattern for all workflows
await runStep(ctx, "stepName", async () => {
  // Implementation
  return result;
});
// Automatic: check journal, skip if success, re-run if started/failed
```

**Phase 1 Workflow Structure** (`src/workflows/single-feature.ts`):
```typescript
export const SINGLE_FEATURE_STEPS = [
  "registerFeature",
  "createWorktree", 
  "runOmp",
  "saveHandoff",
  "mergeWorktree",
  "markCompleted",
  "cleanup",
] as const;
```

**Database Schema** (already includes):
- `missions` table with status enum
- `features` table with `fulfills` JSON column
- `assertions` table (placeholder, needs schema update)
- `step_journal` for crash recovery

### 1.3 Integration Points Identified

✅ **Can reuse**:
- `runStep()` for durable execution
- `WorkflowContext` pattern
- SQLite transaction patterns from `src/db/connection.ts`
- Progress logging via `appendProgress()` helper
- Type patterns: interfaces with status enums

✅ **Must extend**:
- `assertions` table schema (add `type` field: deterministic/semantic)
- New workflows for Phase 2.1 agents
- New omp prompt templates for investigator/planner roles

---

## 2. Module Architecture

### 2.1 Module Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Phase 2.1 Contract Layer                │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Mission Parser  │ │ Investigator     │ │  Planner Agent   │
│  (Markdown → MD) │ │ Agent (Extractor)│ │  (Task Breakdown)│
└─────────┬────────┘ └─────────┬────────┘ └─────────┬────────┘
          │                    │                    │
          │ MissionDocument    │ Assertion[]        │ Feature[]
          │                    │                    │
          └────────────────────┼────────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │  Coverage Validator  │
                    │  (Pre-work Hard Gate)│
                    └──────────┬───────────┘
                               │ ✅ 100% coverage
                               ▼
                    ┌──────────────────────┐
                    │   Phase 1 Executor   │
                    │ (singleFeatureWorkflow)│
                    └──────────────────────┘

Integration with Phase 1:
- All modules use runStep() for crash recovery
- All outputs persist to SQLite
- Wayfinder tools (codegraph/codebase-memory) called during Investigator/Planner phases
```

### 2.2 Data Flow

```
User writes mission.md
       ↓
[Mission Parser]
       ↓ MissionDocument (in-memory)
       ↓
[Investigator Agent] ← Wayfinder (codegraph explore: existing constraints)
       ↓ assertions.json written to .lazyforeman/missions/<name>/
       ↓ assertions persisted to SQLite
       ↓
[Planner Agent] ← Wayfinder (codegraph explore: architecture patterns)
       ↓ features.json written to .lazyforeman/missions/<name>/
       ↓ features persisted to SQLite
       ↓
[Coverage Validator]
       ├─ ✅ Pass → proceed to execution
       └─ ❌ Fail → send() signal, block until user fixes
```

### 2.3 File Structure

```
.lazyforeman/missions/<mission-name>/
├── mission.md              # [HUMAN] High-level goal (or grill-generated)
├── assertions.json         # [AUTO] Extracted by Investigator
├── features.json           # [AUTO] Generated by Planner
├── progress.json           # [AUTO] Real-time status (existing progress_log)
└── wayfinder-context/      # [AUTO] Cached codegraph exploration results
    ├── architecture-snapshot.json
    └── dependencies-<date>.json
```

---

## 3. Type Definitions Design

### 3.1 New Types for Phase 2.1

Based on existing patterns in `src/types/`, extend with:

```typescript
// src/types/mission-document.ts
/**
 * Parsed structure of mission.md after Grill-with-docs.
 * 
 * Single source of truth for mission intent.
 */
export interface MissionDocument {
  /** Mission identifier (from filename or frontmatter) */
  id: string;
  
  /** Mission name */
  name: string;
  
  /** Background section (Grill output) */
  background: {
    currentState: string;
    userPainPoints: string[];
    technicalStatus: string;
  };
  
  /** Goal section (Grill confirmed) */
  goal: string;
  
  /** Boundary section (Grill confirmed) */
  boundary: {
    inScope: string[];
    outOfScope: string[];
  };
  
  /** Success criteria (becomes assertions) */
  successCriteria: Array<{
    description: string;
    verificationMethod: "automated" | "manual";
  }>;
  
  /** Architecture constraints (Grill excavated) */
  architectureConstraints: {
    existingComponents: Array<{
      name: string;
      location: string; // file path from Wayfinder
      usage: string;
    }>;
    techStack: string[];
    performanceRequirements?: string[];
    securityRequirements?: string[];
  };
  
  /** Risks (Grill identified) */
  risks: Array<{
    description: string;
    impact: "high" | "medium" | "low";
    mitigation?: string;
  }>;
  
  /** Metadata */
  createdAt: string;
  updatedAt: string;
}

// src/types/assertion.ts (extend existing)
/**
 * Enhanced assertion type for Phase 2.1.
 * 
 * Extends existing Assertion interface from src/types/assertion.ts.
 */
export interface AssertionV2 extends Assertion {
  /** Assertion type determines validation strategy */
  type: "deterministic" | "semantic";
  
  /** Claimed status: pending → claimed → passed/failed */
  claimedBy: string | null; // Feature ID that claims this assertion
  
  /** Source mission for traceability */
  missionId: string;
  
  /** Original success criterion index in mission.md */
  sourceIndex: number;
}

// src/types/feature.ts (already has fulfills field, just document)
/**
 * Feature already has fulfills: string[] for assertion IDs.
 * No type changes needed, just validation logic.
 */

// src/types/coverage-result.ts
/**
 * Result of pre-work coverage validation.
 */
export interface CoverageResult {
  /** Overall validation status */
  valid: boolean;
  
  /** Total assertions count */
  totalAssertions: number;
  
  /** Assertions with exactly one claimer */
  covered: number;
  
  /** Unclaimed assertions (blocking) */
  orphanAssertions: Array<{
    assertionId: string;
    description: string;
  }>;
  
  /** Over-claimed assertions (blocking) */
  duplicateClaims: Array<{
    assertionId: string;
    claimedBy: string[]; // Multiple feature IDs
  }>;
  
  /** Validation timestamp */
  validatedAt: string;
}

// src/types/wayfinder-context.ts
/**
 * Cached results from Wayfinder exploration.
 * 
 * Stored to avoid redundant codegraph calls during planning.
 */
export interface WayfinderContext {
  missionId: string;
  
  /** Architecture snapshot from codebase-memory */
  architecture: {
    packages: string[];
    boundaries: Array<{ from: string; to: string; callCount: number }>;
    entryPoints: string[];
    capturedAt: string;
  };
  
  /** Relevant code patterns found via codegraph explore */
  relevantPatterns: Array<{
    query: string;
    symbols: Array<{
      name: string;
      file: string;
      type: string;
    }>;
  }>;
  
  /** Dependencies extracted from search */
  dependencies: {
    internal: string[]; // src/* modules
    external: string[]; // node_modules
  };
}
```

### 3.2 Schema Updates

**SQLite schema additions** (to `src/db/schema.sql`):

```sql
-- Extend assertions table
ALTER TABLE assertions ADD COLUMN type TEXT NOT NULL DEFAULT 'deterministic' 
  CHECK(type IN ('deterministic', 'semantic'));
ALTER TABLE assertions ADD COLUMN claimed_by TEXT REFERENCES features(id);
ALTER TABLE assertions ADD COLUMN mission_id TEXT NOT NULL REFERENCES missions(id);
ALTER TABLE assertions ADD COLUMN source_index INTEGER NOT NULL;

-- Add wayfinder_cache table
CREATE TABLE IF NOT EXISTS wayfinder_cache (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id),
  content JSON NOT NULL,
  cached_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- Add coverage_validations table (audit log)
CREATE TABLE IF NOT EXISTS coverage_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  valid INTEGER NOT NULL, -- boolean
  result_json TEXT NOT NULL, -- full CoverageResult
  validated_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
```

---

## 4. Module Interface Design

### 4.1 Mission Parser

**Purpose**: Parse mission.md frontmatter + sections → MissionDocument

```typescript
// src/contract/mission-parser.ts

/**
 * Validation result for mission.md structure.
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    section: string;
    message: string;
  }>;
}

/**
 * Mission parser interface.
 * 
 * Parses mission.md using frontmatter + markdown-it, validates against
 * ADR-0003 quality gates (background ≥3 sentences, boundary has ✅/❌, etc).
 */
export interface MissionParser {
  /**
   * Parse mission.md markdown to structured document.
   * 
   * @param markdown - Raw mission.md content
   * @returns Parsed mission document
   * @throws {ParseError} if markdown is malformed
   */
  parse(markdown: string): MissionDocument;
  
  /**
   * Validate mission document against ADR-0003 quality gates.
   * 
   * Quality gates (from ADR-0003 §5.4):
   * - Background: ≥3 sentences
   * - Boundary: ≥1 ✅ and ≥1 ❌
   * - Architecture constraints: not empty
   * - Risks: ≥1 ⚠️
   * 
   * @param doc - Parsed mission document
   * @returns Validation result with specific errors
   */
  validate(doc: MissionDocument): ValidationResult;
}

/**
 * Create default mission parser.
 * 
 * Implementation uses:
 * - gray-matter for frontmatter parsing
 * - markdown-it for section extraction
 * - Custom rules for ADR-0003 quality gates
 */
export function createMissionParser(): MissionParser;
```

**Implementation notes**:
- Use `gray-matter` for frontmatter (mission ID, name)
- Use `markdown-it` + section tokenizer for structured parsing
- Validate section headers match ADR-0003 template
- Store parsed result in memory (no DB persistence for MissionDocument itself)

### 4.2 Investigator Agent (Assertion Extractor)

**Purpose**: MissionDocument → assertions.json, with Wayfinder context

```typescript
// src/contract/investigator.ts

/**
 * Investigator agent extracts assertions from mission.md.
 * 
 * Leverages Wayfinder (codegraph/codebase-memory) to enrich assertions
 * with architectural context.
 */
export interface InvestigatorAgent {
  /**
   * Extract assertions from mission success criteria.
   * 
   * Process:
   * 1. Parse success criteria from MissionDocument
   * 2. Call Wayfinder to explore existing code patterns
   * 3. Generate VAL-* IDs (VAL-001, VAL-002, ...)
   * 4. Classify as deterministic vs semantic
   * 5. Persist to assertions table + assertions.json
   * 
   * @param mission - Parsed mission document
   * @param ctx - Workflow context for durable execution
   * @param db - SQLite database handle
   * @returns Array of created assertions
   */
  extractAssertions(
    mission: MissionDocument,
    ctx: WorkflowContext,
    db: SqliteDb,
  ): Promise<AssertionV2[]>;
}

/**
 * Wayfinder integration for code exploration.
 * 
 * Wraps codegraph/codebase-memory MCP tools.
 */
export interface WayfinderClient {
  /**
   * Explore architecture for mission context.
   * 
   * Calls codebase-memory-mcp___get_architecture and codegraph___codegraph_explore
   * to gather relevant patterns.
   * 
   * @param mission - Mission document with architecture constraints
   * @returns Wayfinder context to cache
   */
  exploreArchitecture(mission: MissionDocument): Promise<WayfinderContext>;
  
  /**
   * Search for existing implementations of a pattern.
   * 
   * Example: "authentication bcrypt usage" → find src/auth/hash.ts
   * 
   * @param query - Natural language search query
   * @returns Relevant code symbols and files
   */
  searchPattern(query: string): Promise<Array<{ name: string; file: string }>>;
}

/**
 * Create investigator agent with Wayfinder.
 * 
 * @param wayfinder - Wayfinder client (injected for testability)
 */
export function createInvestigator(
  wayfinder: WayfinderClient,
): InvestigatorAgent;
```

**Implementation notes**:
- Use `runStep(ctx, "extractAssertions", async () => ...)` for crash recovery
- Call Wayfinder once per mission, cache results in `wayfinder_cache` table
- Use omp with "investigator" role to classify deterministic vs semantic
- Generate VAL-001, VAL-002, ... IDs sequentially
- Write both to SQLite (`assertions` table) and JSON file (`.lazyforeman/missions/<name>/assertions.json`)

### 4.3 Planner Agent (Task Breakdown)

**Purpose**: MissionDocument + assertions → features.json with DAG

```typescript
// src/contract/planner.ts

/**
 * Planner agent breaks mission into features and builds dependency DAG.
 * 
 * Uses Wayfinder context + omp with "planner" role.
 */
export interface PlannerAgent {
  /**
   * Generate features from mission and assertions.
   * 
   * Process:
   * 1. Read mission goal + architecture constraints + Wayfinder context
   * 2. Call omp with "planner" role to generate feature breakdown
   * 3. Validate each feature claims ≥1 assertion
   * 4. Build dependency DAG (preconditions field)
   * 5. Persist to features table + features.json
   * 
   * @param mission - Parsed mission document
   * @param assertions - Assertions from Investigator
   * @param wayfinderContext - Cached exploration results
   * @param ctx - Workflow context for durable execution
   * @param db - SQLite database handle
   * @returns Array of created features with DAG
   */
  generateFeatures(
    mission: MissionDocument,
    assertions: AssertionV2[],
    wayfinderContext: WayfinderContext,
    ctx: WorkflowContext,
    db: SqliteDb,
  ): Promise<Feature[]>;
}

/**
 * DAG validator checks for cycles in feature dependencies.
 */
export interface DagValidator {
  /**
   * Validate feature dependency graph is acyclic.
   * 
   * @param features - Features with preconditions
   * @returns Topological sort order if valid, or cycle path if invalid
   */
  validate(features: Feature[]): 
    | { valid: true; order: string[] }
    | { valid: false; cycle: string[] };
}

/**
 * Create planner agent.
 * 
 * @param wayfinder - Wayfinder client for architecture exploration
 */
export function createPlanner(wayfinder: WayfinderClient): PlannerAgent;
```

**Implementation notes**:
- Use `runStep(ctx, "generateFeatures", async () => ...)` for crash recovery
- Call omp with custom prompt template for planner role (include Wayfinder context)
- Validate DAG with Kahn's algorithm (detect cycles)
- Ensure every feature has `fulfills: string[]` with ≥1 assertion ID
- Write to SQLite + JSON file atomically (transaction)

### 4.4 Coverage Validator (Pre-work Hard Gate)

**Purpose**: Validate 100% assertion coverage before execution starts

```typescript
// src/contract/coverage-validator.ts

/**
 * Coverage validator enforces the pre-work hard gate.
 * 
 * Ensures every assertion is claimed by exactly one feature before
 * any feature execution begins (ADR-0003 §2.2).
 */
export interface CoverageValidator {
  /**
   * Validate assertion coverage.
   * 
   * Rules:
   * 1. Every assertion must be claimed by exactly 1 feature
   * 2. No orphan assertions (0 claimers)
   * 3. No duplicate claims (2+ claimers)
   * 
   * @param assertions - All assertions for mission
   * @param features - All features for mission
   * @returns Coverage result with specific violations
   */
  validate(
    assertions: AssertionV2[],
    features: Feature[],
  ): CoverageResult;
  
  /**
   * Block execution until coverage is fixed (human intervention).
   * 
   * Implementation:
   * 1. Log coverage violations to coverage_validations table
   * 2. Write violation report to .lazyforeman/missions/<name>/coverage-violations.txt
   * 3. Throw error with clear instructions for fixing
   * 
   * In Phase 2.2, this will use send()/recv() for graceful blocking.
   * For Phase 2.1, throw error and require manual fix + re-run.
   * 
   * @param result - Failed coverage result
   * @throws {CoverageViolationError} Always throws with detailed message
   */
  blockUntilFixed(result: CoverageResult): never;
}

/**
 * Coverage violation error.
 * 
 * Contains structured violations for programmatic handling.
 */
export class CoverageViolationError extends Error {
  constructor(
    public readonly result: CoverageResult,
  ) {
    super(formatViolations(result));
    this.name = "CoverageViolationError";
  }
}

/**
 * Create coverage validator.
 */
export function createCoverageValidator(): CoverageValidator;
```

**Implementation notes**:
- Pure validation logic (no I/O except logging)
- Clear error messages with fix instructions:
  ```
  ❌ Assertion coverage validation failed:
  
  Orphan assertions (not claimed by any feature):
  - VAL-003: "User can reset password via email"
    Fix: Add a feature that includes VAL-003 in its fulfills array
  
  Duplicate claims (claimed by multiple features):
  - VAL-001: "User can login with email/password"
    Claimed by: feat-001, feat-002
    Fix: Remove VAL-001 from one of these features' fulfills arrays
  ```
- Write violations to both SQLite audit log and text file

---

## 5. Workflow Orchestration

### 5.1 Mission Workflow (New)

**File**: `src/workflows/mission.ts`

```typescript
/**
 * Complete mission workflow (Phase 2.1).
 * 
 * Orchestrates contract layer → execution layer.
 */
export async function missionWorkflow(
  ctx: WorkflowContext,
  db: SqliteDb,
  input: MissionWorkflowInput,
): Promise<MissionWorkflowResult> {
  // Step 1: Parse mission.md
  const missionDoc = await runStep(ctx, "parseMission", async () => {
    const markdown = await fs.readFile(input.missionPath, "utf8");
    const parser = createMissionParser();
    const doc = parser.parse(markdown);
    const validation = parser.validate(doc);
    if (!validation.valid) {
      throw new Error(`Invalid mission.md: ${validation.errors.map(e => e.message).join(", ")}`);
    }
    return doc;
  });
  
  // Step 2: Extract assertions (Investigator)
  const assertions = await runStep(ctx, "extractAssertions", async () => {
    const wayfinder = createWayfinder();
    const investigator = createInvestigator(wayfinder);
    return investigator.extractAssertions(missionDoc, ctx, db);
  });
  
  // Step 3: Generate features (Planner)
  const features = await runStep(ctx, "generateFeatures", async () => {
    const wayfinder = createWayfinder();
    const wayfinderContext = await wayfinder.exploreArchitecture(missionDoc);
    const planner = createPlanner(wayfinder);
    return planner.generateFeatures(missionDoc, assertions, wayfinderContext, ctx, db);
  });
  
  // Step 4: Validate coverage (Hard gate)
  await runStep(ctx, "validateCoverage", async () => {
    const validator = createCoverageValidator();
    const result = validator.validate(assertions, features);
    if (!result.valid) {
      validator.blockUntilFixed(result); // Throws
    }
    return result;
  });
  
  // Step 5: Execute features (Phase 1 infrastructure)
  const handoffs = await runStep(ctx, "executeFeatures", async () => {
    // DAG topological sort
    const order = topologicalSort(features);
    const results = [];
    
    for (const featureId of order) {
      const feature = features.find(f => f.id === featureId)!;
      const featureCtx = {
        workflowId: generateWorkflowId("single-feature", featureId),
        journal: ctx.journal,
      };
      
      const result = await singleFeatureWorkflow(featureCtx, db, {
        missionId: missionDoc.id,
        featureId: feature.id,
        spec: feature.description,
        missionName: missionDoc.name,
        featureName: feature.name,
      });
      
      results.push(result);
    }
    
    return results;
  });
  
  return {
    success: true,
    missionId: missionDoc.id,
    assertionCount: assertions.length,
    featureCount: features.length,
    handoffIds: handoffs.map(h => h.handoffId),
  };
}
```

### 5.2 Integration with Phase 1

**Reuse existing patterns**:
- `runStep()` for every step (crash recovery)
- `WorkflowContext` with `workflowId` + `journal`
- `singleFeatureWorkflow()` for feature execution
- SQLite transactions for atomic state updates

**New workflow types**:
- `WorkflowType = "single-feature" | "milestone" | "mission"` (extend enum)

---

## 6. Tool Integration Strategy

### 6.1 Wayfinder Role

**When to call**:
1. **Investigator phase**: Explore architecture to classify assertions
   - Query: "authentication patterns bcrypt usage"
   - Tool: `codegraph___codegraph_explore`
   
2. **Planner phase**: Find existing modules to reuse
   - Query: "user management login session"
   - Tool: `codebase-memory-mcp___search_graph`

**Caching strategy**:
- Cache Wayfinder results in `wayfinder_cache` table
- TTL: 1 hour (configurable)
- Invalidate on mission.md update

### 6.2 Tool Call Sequence

```typescript
// Investigator: Architecture exploration
const architecture = await codebase-memory-mcp___get_architecture({
  project: "E-codespace-lazyforeman",
  aspects: ["all"]
});

// Investigator: Pattern search for constraints
for (const constraint of mission.architectureConstraints.existingComponents) {
  const results = await codegraph___codegraph_explore({
    projectPath: repoRoot,
    query: `${constraint.name} usage implementation`
  });
  // Enrich constraint with actual file locations
}

// Planner: Dependency analysis
const deps = await codebase-memory-mcp___search_graph({
  project: "E-codespace-lazyforeman",
  query: mission.goal, // Natural language
  limit: 20
});
```

### 6.3 Fallback Strategy

If Wayfinder tools fail (offline, not indexed):
1. Log warning
2. Proceed with limited context (mission.md only)
3. Mark in WayfinderContext as `fallbackMode: true`

---

## 7. Error Handling Strategy

### 7.1 Recoverable Errors

**Mission parsing errors**:
- Invalid frontmatter → Clear message: "mission.md must have id and name in frontmatter"
- Missing required section → "mission.md missing required section: Background"
- Quality gate failure → List specific violations

**Coverage validation errors**:
- Orphan assertions → List each orphan with fix instructions
- Duplicate claims → List conflicts with feature IDs

**Recovery**: User edits mission.md or assertions.json/features.json, re-runs workflow

### 7.2 Crash Recovery

All steps use `runStep()`:
- Parsing step crash → Re-parse on resume (file may have changed)
- Investigator crash → Re-extract assertions (idempotent)
- Planner crash → Re-generate features (idempotent)
- Coverage validation crash → Re-validate (pure function)

### 7.3 Validation Errors vs Runtime Errors

**Validation errors** (user-fixable):
- Return structured error with fix instructions
- Do not retry automatically

**Runtime errors** (transient):
- Wayfinder timeout → Retry with exponential backoff
- omp failure → Log and re-throw (Phase 1 pattern)
- SQLite lock → Retry with backoff

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Mission Parser** (`test/contract/mission-parser.test.ts`):
- ✅ Parse valid mission.md
- ✅ Reject invalid frontmatter
- ✅ Validate quality gates (background, boundary, risks)
- ✅ Handle missing sections

**Investigator** (`test/contract/investigator.test.ts`):
- ✅ Extract assertions from success criteria
- ✅ Generate unique VAL-* IDs
- ✅ Classify deterministic vs semantic
- ✅ Mock Wayfinder calls
- ✅ Persist to SQLite + JSON file

**Planner** (`test/contract/planner.test.ts`):
- ✅ Generate features with assertion claims
- ✅ Build valid DAG (no cycles)
- ✅ Detect dependency cycles
- ✅ Mock Wayfinder calls
- ✅ Validate fulfills arrays

**Coverage Validator** (`test/contract/coverage-validator.test.ts`):
- ✅ Detect orphan assertions
- ✅ Detect duplicate claims
- ✅ Accept valid 100% coverage
- ✅ Generate clear error messages

### 8.2 Integration Tests

**Mission Workflow** (`test/workflows/mission.test.ts`):
- ✅ Full workflow: mission.md → assertions → features → execution
- ✅ Crash recovery: interrupt at each step, resume
- ✅ Coverage gate blocks invalid plans
- ✅ Features execute in DAG order

**Wayfinder Integration** (`test/integration/wayfinder.test.ts`):
- ✅ Real codegraph explore call (opt-in with env var)
- ✅ Fallback mode when tools unavailable
- ✅ Cache invalidation on mission update

### 8.3 Acceptance Tests

**End-to-end mission** (`test/e2e/simple-mission.test.ts`):
1. Create mission.md with 3 success criteria
2. Run missionWorkflow
3. Verify 3 assertions created (VAL-001, VAL-002, VAL-003)
4. Verify 2-3 features created with valid DAG
5. Verify coverage validation passes
6. Verify all features executed
7. Verify progress_log contains expected events

---

## 9. Implementation Plan

### 9.1 Task Breakdown

| Task ID | Task Name | Dependencies | Effort | Tools Used |
|---------|-----------|--------------|--------|------------|
| **T2.1.1** | Mission Parser Implementation | None | 8h | Read mission.md patterns |
| **T2.1.2** | SQLite Schema Extensions | None | 4h | Grep existing schema.sql |
| **T2.1.3** | Wayfinder Client Wrapper | T2.1.2 | 6h | codegraph, codebase-memory |
| **T2.1.4** | Investigator Agent | T2.1.3 | 12h | codegraph explore |
| **T2.1.5** | Planner Agent | T2.1.3, T2.1.4 | 12h | codebase-memory search |
| **T2.1.6** | Coverage Validator | T2.1.4, T2.1.5 | 6h | Read existing validation patterns |
| **T2.1.7** | Mission Workflow Orchestration | T2.1.1-T2.1.6 | 10h | codegraph workflow patterns |
| **T2.1.8** | Unit Tests | T2.1.1-T2.1.6 | 16h | Read test/runtime/*.test.ts |
| **T2.1.9** | Integration Tests | T2.1.7, T2.1.8 | 12h | Read test/workflows/*.test.ts |
| **T2.1.10** | Documentation & Examples | T2.1.9 | 6h | None |

**Total estimated effort**: 92 hours (~2.5 weeks for 1 developer)

### 9.2 Dependency Graph

```
T2.1.1 ──┐
          ├──> T2.1.7 ──> T2.1.9 ──> T2.1.10
T2.1.2 ──┤
          │
          ├──> T2.1.3 ──┬──> T2.1.4 ──┐
          │             │             ├──> T2.1.6 ──> T2.1.7
          │             └──> T2.1.5 ──┘
          │
          └──────────────────────────────> T2.1.8 ──> T2.1.9
```

### 9.3 Testing Strategy per Task

| Task | Test Approach | Pass Criteria |
|------|---------------|---------------|
| T2.1.1 | TDD: write parser tests first | 10+ test cases pass, quality gates enforced |
| T2.1.2 | Schema migration test | SQLite opens, all tables created, foreign keys work |
| T2.1.3 | Mock MCP responses | Wayfinder returns cached results, fallback works |
| T2.1.4 | Mock omp + Wayfinder | VAL-* IDs unique, types classified, JSON written |
| T2.1.5 | Mock omp + Wayfinder | Features have valid DAG, fulfills arrays populated |
| T2.1.6 | Pure function tests | All violation types detected, error messages clear |
| T2.1.7 | Crash injection tests | Resume at any step succeeds, progress_log correct |
| T2.1.8 | Coverage ≥80% | All modules have unit tests |
| T2.1.9 | Real SQLite + mock omp | Full mission workflow completes end-to-end |
| T2.1.10 | Manual review | README has example mission.md, ADR updated |

---

## 10. Risks & Mitigation

### 10.1 Identified Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Wayfinder tools unavailable** | Medium | Medium | Implement fallback mode, cache results |
| **omp prompt complexity** | High | Medium | Start with simple templates, iterate with real missions |
| **Coverage validation too strict** | Medium | Low | Allow manual override flag (emergency escape hatch) |
| **DAG complexity** | Low | Low | Kahn's algorithm is well-tested, limit max features to 50 |
| **mission.md quality variance** | High | High | Enforce quality gates, provide mission.md template |

### 10.2 Mitigation Details

**Wayfinder unavailable**:
- Cache results in SQLite for 1 hour
- Fallback to mission.md-only mode
- Log warning, do not fail workflow

**omp prompt complexity**:
- Version prompts in `src/prompts/investigator-v1.txt`
- Unit test prompt generation
- Validate omp response against schema immediately

**Coverage validation too strict**:
- Add `--skip-coverage-gate` flag (dev only)
- Log warning when used
- Remove before production

---

## 11. Success Criteria

### 11.1 Functional Criteria

✅ **Can parse mission.md**:
- Valid mission.md → MissionDocument
- Invalid mission.md → clear error message

✅ **Can extract assertions**:
- Success criteria → VAL-* IDs
- Wayfinder enriches with architecture context
- assertions.json + SQLite row created

✅ **Can generate features**:
- Assertions + mission → Feature[]
- DAG is acyclic
- Every feature claims ≥1 assertion
- features.json + SQLite rows created

✅ **Coverage gate works**:
- 100% coverage → pass
- Orphan/duplicate → block with clear error

✅ **End-to-end mission**:
- mission.md → assertions → features → execution → handoffs
- Crash recovery at any step

### 11.2 Non-Functional Criteria

✅ **Performance**:
- Parse mission.md: <100ms
- Extract assertions: <5s (with Wayfinder)
- Generate features: <10s (with Wayfinder)
- Coverage validation: <100ms

✅ **Maintainability**:
- Code coverage ≥80%
- All modules have TSDoc comments
- ADRs updated for all major decisions

✅ **Testability**:
- All Wayfinder calls mockable
- All omp calls mockable (USE_REAL_OMP=false)
- SQLite in-memory mode for tests

---

## 12. Next Steps Recommendation

### 12.1 Recommended First Task

**Start with T2.1.1: Mission Parser Implementation**

**Rationale**:
- No external dependencies
- Defines MissionDocument type that all other modules need
- Can be fully tested without Wayfinder/omp
- Provides immediate value (validate mission.md quality)

**Subtasks**:
1. Define MissionDocument type in `src/types/mission-document.ts`
2. Implement parser with gray-matter + markdown-it
3. Implement quality gate validation
4. Write 10+ unit tests
5. Create mission.md template in `docs/templates/`

**Deliverable**: Working mission parser with tests passing

### 12.2 Follow-up Sequence

After T2.1.1:
1. **T2.1.2**: Extend SQLite schema (enables persistence)
2. **T2.1.3**: Wayfinder wrapper (enables next two)
3. **T2.1.4 + T2.1.5 in parallel**: Investigator + Planner (can work independently)
4. **T2.1.6**: Coverage validator (depends on types from T2.1.4/T2.1.5)
5. **T2.1.7**: Orchestrate into mission workflow
6. **T2.1.8 + T2.1.9**: Testing (parallel)
7. **T2.1.10**: Documentation

---

## 13. Appendices

### A. Mission.md Template

```markdown
---
id: mission-001
name: User Authentication System
---

# Mission: User Authentication System

## Background
Current system has no authentication. Users access all features without login.
User pain points: no privacy, no personalization, security risk.
Technical status: no auth middleware, no user table, no session management.

## Goal
Implement a secure authentication system that allows users to register, login, and maintain sessions.

## Boundary
✅ Do:
- Email/password registration
- Login with session cookies
- Password hashing with bcrypt
- Logout functionality

❌ Don't do:
- OAuth/social login (future phase)
- Two-factor authentication (out of scope)
- Password reset (separate mission)

## Success Criteria
- [ ] User can register with email and password
- [ ] Password is hashed before storage (bcrypt)
- [ ] User can login with correct credentials
- [ ] Login fails with clear error for wrong password
- [ ] User session persists across requests
- [ ] User can logout and session is cleared

## Architecture Constraints
- Backend: Node.js/Express (existing)
- Database: PostgreSQL (existing)
- Reuse existing user table schema (src/db/models/user.ts)
- Use bcrypt package (already in package.json)

## Risks
⚠️ Risk 1: Password hashing performance
- Impact: High traffic may slow down login
- Mitigation: Use bcrypt work factor 10 (standard)

⚠️ Risk 2: Session storage scalability
- Impact: In-memory sessions won't scale
- Mitigation: Use Redis for session store (pre-research needed)
```

### B. Example assertions.json

```json
{
  "assertions": [
    {
      "id": "VAL-001",
      "description": "User can register with email and password",
      "type": "deterministic",
      "status": "pending",
      "claimedBy": null,
      "missionId": "mission-001",
      "sourceIndex": 0,
      "createdAt": "2026-10-06T10:00:00Z",
      "updatedAt": "2026-10-06T10:00:00Z"
    },
    {
      "id": "VAL-002",
      "description": "Password is hashed before storage (bcrypt)",
      "type": "deterministic",
      "status": "pending",
      "claimedBy": null,
      "missionId": "mission-001",
      "sourceIndex": 1,
      "createdAt": "2026-10-06T10:00:00Z",
      "updatedAt": "2026-10-06T10:00:00Z"
    }
  ]
}
```

### C. Example features.json

```json
{
  "features": [
    {
      "id": "feat-001",
      "name": "User Registration API",
      "description": "Implement POST /api/register endpoint with email validation and bcrypt hashing",
      "status": "pending",
      "fulfills": ["VAL-001", "VAL-002"],
      "preconditions": [],
      "missionId": "mission-001",
      "createdAt": "2026-10-06T10:05:00Z",
      "updatedAt": "2026-10-06T10:05:00Z"
    },
    {
      "id": "feat-002",
      "name": "Login API",
      "description": "Implement POST /api/login endpoint with session creation",
      "status": "pending",
      "fulfills": ["VAL-003", "VAL-004", "VAL-005"],
      "preconditions": ["feat-001"],
      "missionId": "mission-001",
      "createdAt": "2026-10-06T10:05:00Z",
      "updatedAt": "2026-10-06T10:05:00Z"
    }
  ]
}
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-10-06 | 1.0 | Architecture Agent | Initial draft |
