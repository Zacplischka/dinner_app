import { z } from 'zod';
export declare const sessionJoinPayloadSchema: z.ZodObject<{
    sessionCode: z.ZodString;
    displayName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionCode: string;
    displayName: string;
}, {
    sessionCode: string;
    displayName: string;
}>;
export declare const selectionSubmitPayloadSchema: z.ZodObject<{
    sessionCode: z.ZodString;
    selections: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    sessionCode: string;
    selections: string[];
}, {
    sessionCode: string;
    selections: string[];
}>;
export declare const sessionRestartPayloadSchema: z.ZodObject<{
    sessionCode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionCode: string;
}, {
    sessionCode: string;
}>;
export declare const wsDinnerOptionSchema: z.ZodObject<{
    optionId: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    optionId: string;
    displayName: string;
    description?: string | undefined;
}, {
    optionId: string;
    displayName: string;
    description?: string | undefined;
}>;
export declare const sessionResultsEventSchema: z.ZodObject<{
    sessionCode: z.ZodString;
    overlappingOptions: z.ZodArray<z.ZodObject<{
        optionId: z.ZodString;
        displayName: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        optionId: string;
        displayName: string;
        description?: string | undefined;
    }, {
        optionId: string;
        displayName: string;
        description?: string | undefined;
    }>, "many">;
    allSelections: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>;
    hasOverlap: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    sessionCode: string;
    overlappingOptions: {
        optionId: string;
        displayName: string;
        description?: string | undefined;
    }[];
    allSelections: Record<string, string[]>;
    hasOverlap: boolean;
}, {
    sessionCode: string;
    overlappingOptions: {
        optionId: string;
        displayName: string;
        description?: string | undefined;
    }[];
    allSelections: Record<string, string[]>;
    hasOverlap: boolean;
}>;
export declare const errorEventSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    details?: Record<string, any> | undefined;
}, {
    code: string;
    message: string;
    details?: Record<string, any> | undefined;
}>;
//# sourceMappingURL=websocket-events.d.ts.map