export interface CreateSessionRequest {
    hostName: string;
}
export interface SessionResponse {
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: 'waiting' | 'selecting' | 'complete' | 'expired';
    expiresAt: string;
    shareableLink: string;
}
export interface JoinSessionRequest {
    participantName: string;
}
export interface JoinSessionResponse {
    participantId: string;
    sessionCode: string;
    participantName: string;
    participantCount: number;
}
export interface DinnerOptionsResponse {
    options: Array<{
        optionId: string;
        displayName: string;
        description?: string;
    }>;
}
export interface ErrorResponse {
    error: string;
    code: string;
    message: string;
    details?: Record<string, any>;
}
//# sourceMappingURL=api.d.ts.map