export declare function generateSessionCode(): string;
export declare function createSession(hostName: string): Promise<{
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: string;
    expiresAt: string;
    shareableLink: string;
}>;
export declare function getSession(sessionCode: string): Promise<{
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: string;
    expiresAt: string;
    shareableLink: string;
} | null>;
export declare function joinSession(sessionCode: string, participantId: string, displayName: string): Promise<{
    participantId: string;
    sessionCode: string;
    participantName: string;
    participantCount: number;
}>;
export declare function expireSession(sessionCode: string): Promise<void>;
//# sourceMappingURL=SessionService.d.ts.map