export declare const SESSION_TTL_SECONDS: number;
export declare function calculateExpireAt(): number;
export declare function refreshSessionTtl(sessionCode: string, participantIds: string[]): Promise<number>;
export declare function getExpiresAtISO(expireAt: number): string;
//# sourceMappingURL=ttl-utils.d.ts.map