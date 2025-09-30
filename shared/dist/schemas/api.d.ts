import { z } from 'zod';
export declare const createSessionRequestSchema: z.ZodObject<{
    hostName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    hostName: string;
}, {
    hostName: string;
}>;
export declare const sessionResponseSchema: z.ZodObject<{
    sessionCode: z.ZodString;
    hostName: z.ZodString;
    participantCount: z.ZodNumber;
    state: z.ZodEnum<["waiting", "selecting", "complete", "expired"]>;
    expiresAt: z.ZodString;
    shareableLink: z.ZodString;
}, "strip", z.ZodTypeAny, {
    hostName: string;
    sessionCode: string;
    participantCount: number;
    state: "waiting" | "selecting" | "complete" | "expired";
    expiresAt: string;
    shareableLink: string;
}, {
    hostName: string;
    sessionCode: string;
    participantCount: number;
    state: "waiting" | "selecting" | "complete" | "expired";
    expiresAt: string;
    shareableLink: string;
}>;
export declare const joinSessionRequestSchema: z.ZodObject<{
    participantName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    participantName: string;
}, {
    participantName: string;
}>;
export declare const joinSessionResponseSchema: z.ZodObject<{
    participantId: z.ZodString;
    sessionCode: z.ZodString;
    participantName: z.ZodString;
    participantCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    sessionCode: string;
    participantCount: number;
    participantName: string;
    participantId: string;
}, {
    sessionCode: string;
    participantCount: number;
    participantName: string;
    participantId: string;
}>;
export declare const dinnerOptionSchema: z.ZodObject<{
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
export declare const dinnerOptionsResponseSchema: z.ZodObject<{
    options: z.ZodArray<z.ZodObject<{
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
}, "strip", z.ZodTypeAny, {
    options: {
        optionId: string;
        displayName: string;
        description?: string | undefined;
    }[];
}, {
    options: {
        optionId: string;
        displayName: string;
        description?: string | undefined;
    }[];
}>;
export declare const errorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    error: string;
    details?: Record<string, any> | undefined;
}, {
    code: string;
    message: string;
    error: string;
    details?: Record<string, any> | undefined;
}>;
//# sourceMappingURL=api.d.ts.map