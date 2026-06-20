export declare function generateSessionCode(): string;
export declare function createSession(hostName: string, location?: {
    latitude: number;
    longitude: number;
    address?: string;
}, searchRadiusMiles?: number): Promise<{
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: string;
    expiresAt: string;
    shareableLink: string;
    location?: {
        latitude: number;
        longitude: number;
        address?: string;
    };
    searchRadiusMiles?: number;
    restaurantCount?: number;
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