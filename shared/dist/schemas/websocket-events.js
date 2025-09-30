// Zod schemas for WebSocket event validation
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md
import { z } from 'zod';
// Client → Server schemas
export const sessionJoinPayloadSchema = z.object({
    sessionCode: z
        .string()
        .regex(/^[A-Z0-9]{6}$/, 'Session code must be 6 alphanumeric characters'),
    displayName: z.string().min(1, 'Display name required').max(50, 'Display name too long'),
});
export const selectionSubmitPayloadSchema = z.object({
    sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
    selections: z.array(z.string()).min(1, 'Must select at least 1 option').max(50),
});
export const sessionRestartPayloadSchema = z.object({
    sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
});
// Server → Client schemas (for client-side validation if needed)
export const wsDinnerOptionSchema = z.object({
    optionId: z.string(),
    displayName: z.string(),
    description: z.string().optional(),
});
export const sessionResultsEventSchema = z.object({
    sessionCode: z.string(),
    overlappingOptions: z.array(wsDinnerOptionSchema),
    allSelections: z.record(z.array(z.string())),
    hasOverlap: z.boolean(),
});
export const errorEventSchema = z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
});
//# sourceMappingURL=websocket-events.js.map