import { z } from "zod";

/**
 * Zod schema for SignalResolution validation
 */
export const SignalResolutionSchema = z.object({
	decision: z.enum(["approve", "reject", "modify"]),
	reasoning: z.string().min(10, "Reasoning must be at least 10 characters"),
	modifiedPlan: z.unknown().optional(),
	resolvedBy: z.enum(["user", "system"]),
});

/**
 * Type inference from schema
 */
export type ValidatedSignalResolution = z.infer<typeof SignalResolutionSchema>;
