/**
 * Grill Agent Prompt Templates
 *
 * Defines the conversation prompts for the five-dimension drilling
 * mechanism that generates high-quality mission.md documents.
 *
 * Based on ADR-0003 §5.2 five-dimension deep dive.
 */

import { GrillDimension } from "./types.js";

/**
 * System prompt defining the Grill Agent role
 */
export const GRILL_SYSTEM_PROMPT = `You are a Grill Agent, an expert requirements analyst for software projects.

Your mission is to conduct a thorough interview with the user to generate a complete mission.md document that follows the ADR-0003 template.

You must explore five dimensions:
1. GOAL: What problem does this solve? Who will use it? How? What are the success criteria?
2. BOUNDARY: What's in scope? What's out of scope? What dependencies exist? What are known issues?
3. TECHNICAL: What's the existing architecture? What tech debt exists? What are the performance/security requirements?
4. ACCEPTANCE: How will each success criterion be verified? Is it automated testing or manual checking? What are the edge cases?
5. RISK: What could go wrong? What's uncertain? What needs pre-research?

For each dimension, ask clarifying questions until you have sufficient detail.

When you have thoroughly explored all five dimensions, generate a mission.md document following this template:

# Mission: <name>

## 背景
- Current system state
- User pain points
- Technical status

## 目标
One sentence describing what this mission achieves.

## 边界
✅ 做：In-scope items
❌ 不做：Out-of-scope items

## 成功标准
- [ ] Criterion 1 (verifiable)
- [ ] Criterion 2 (verifiable)

## 架构约束
- Reusable component inventory
- Tech stack requirements
- Performance/security constraints

## 风险
⚠️ Risk 1: Description + impact
⚠️ Risk 2: Description + pre-research plan

Be thorough but efficient. Ask targeted questions that reveal hidden assumptions and constraints.`;

/**
 * Dimension-specific drilling prompts
 */
export const DIMENSION_PROMPTS: Record<GrillDimension, string> = {
	[GrillDimension.GOAL]: `Let's clarify the GOAL dimension:

- What specific problem does this feature/project solve?
- Who are the end users? How will they interact with it?
- What does success look like? How will we know when we're done?
- Are there any quantitative metrics (performance, usage, etc.)?

Please provide detailed answers to help me understand the core objective.`,

	[GrillDimension.BOUNDARY]: `Let's define the BOUNDARY dimension:

- What is explicitly IN SCOPE for this mission?
- What is explicitly OUT OF SCOPE (what won't be done)?
- What existing systems or components does this depend on?
- Are there any known pitfalls or issues we should be aware of?
- Are there any constraints from stakeholders or external factors?

Clear boundaries prevent scope creep and set realistic expectations.`,

	[GrillDimension.TECHNICAL]: `Let's explore the TECHNICAL dimension:

- What is the current architecture of the system?
- Are there existing components we can reuse?
- What technical debt or limitations exist?
- What are the performance requirements (latency, throughput, scale)?
- What are the security requirements?
- What is the required tech stack?

Understanding the technical landscape helps avoid costly rework later.`,

	[GrillDimension.ACCEPTANCE]: `Let's refine the ACCEPTANCE dimension:

For each success criterion you've mentioned:
- How will it be verified? (automated test, manual QA, user acceptance?)
- What are the edge cases or boundary conditions?
- What does "done" look like for this criterion?
- Are there any acceptance thresholds (e.g., "95% test coverage")?

Concrete acceptance criteria prevent ambiguity during implementation.`,

	[GrillDimension.RISK]: `Let's identify the RISK dimension:

- What could go wrong during implementation?
- What uncertainties exist (technical, business, external)?
- What needs pre-research or prototyping before committing?
- What are the consequences if this mission fails?
- Are there any dependencies on external teams or systems?

Identifying risks early allows for mitigation strategies.`,
};

/**
 * Generate mission.md synthesis prompt from drill results
 */
export function generateMissionSynthesisPrompt(
	roughGoal: string,
	conversationHistory: string,
): string {
	return `Based on our thorough interview, please generate a complete mission.md document.

Original rough goal:
${roughGoal}

Our conversation has covered:
${conversationHistory}

Now generate a mission.md document following the ADR-0003 template:

# Mission: <name>

## 背景
(3+ sentences about current state, pain points, technical context)

## 目标
(Single sentence describing what to achieve)

## 边界
✅ 做：
- Item 1
- Item 2

❌ 不做：
- Item 1
- Item 2

## 成功标准
- [ ] Criterion 1 (verifiable)
- [ ] Criterion 2 (verifiable)

## 架构约束
- Reusable components
- Tech stack requirements
- Performance/security constraints

## 风险
⚠️ Risk 1: Description + impact + mitigation
⚠️ Risk 2: Description + pre-research plan

Ensure the document is:
- Complete (all sections present)
- Specific (no vague statements)
- Verifiable (success criteria are testable)
- Realistic (acknowledges risks and constraints)

Output ONLY the mission.md content, no explanatory text.`;
}

/**
 * Follow-up question prompts for incomplete dimensions
 */
export function generateFollowUpPrompt(
	dimension: GrillDimension,
	missingAspects: string[],
): string {
	return `I need more detail about the ${dimension.toUpperCase()} dimension.

Specifically, we haven't covered:
${missingAspects.map((aspect) => `- ${aspect}`).join("\n")}

Could you provide more information about these aspects?`;
}
