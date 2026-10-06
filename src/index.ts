/**
 * Lazyforeman - Multi-agent orchestration framework
 *
 * 领域契约的类型入口；运行时模块（runtime/db/workflows）按路径直接引用。
 */

export type { Mission } from "./types/mission.js";
export type { Feature } from "./types/feature.js";
export type { Assertion } from "./types/assertion.js";
export type { Handoff } from "./types/handoff.js";
export type { ProgressEvent } from "./types/progress-event.js";
export { HandoffSchema } from "./types/handoff.js";

// Phase 2.1 契约层
export { parseMissionMarkdown } from "./mission/parser.js";
export {
	createInvestigatorAgent,
	exportAssertionsJson,
	type InvestigatorAgent,
} from "./investigator/agent.js";
export type {
	AssertionGenerationResult,
	AssertionExport,
} from "./types/assertion-generator.js";
export {
	createPlannerAgent,
	exportFeaturesJson,
	type PlannerAgent,
	type FeatureGenerationStrategy,
} from "./planner/agent.js";
export type { FeatureExport } from "./planner/agent.js";
