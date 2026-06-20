import type { Session } from '@dinder/shared/types';
export declare function createSession(sessionCode: string, hostId: string, hostName?: string, location?: {
    latitude: number;
    longitude: number;
    address?: string;
}, searchRadiusMiles?: number): Promise<Session>;
export declare function getSession(sessionCode: string): Promise<Session | null>;
export declare function updateSessionState(sessionCode: string, state: 'waiting' | 'selecting' | 'complete' | 'expired'): Promise<void>;
export declare function updateLastActivity(sessionCode: string): Promise<void>;
export declare function incrementParticipantCount(sessionCode: string): Promise<number>;
export declare function setParticipantCount(sessionCode: string, count: number): Promise<void>;
export declare function deleteSession(sessionCode: string): Promise<void>;
//# sourceMappingURL=Session.d.ts.map