import type { Restaurant } from './models.js';
export interface CreateSessionRequest {
    hostName: string;
    location: {
        latitude: number;
        longitude: number;
        address?: string;
    };
    searchRadiusMiles: number;
}
export interface SessionResponse {
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: 'waiting' | 'selecting' | 'complete' | 'expired';
    expiresAt: string;
    shareableLink: string;
    location: {
        latitude: number;
        longitude: number;
        address?: string;
    };
    searchRadiusMiles: number;
    restaurantCount: number;
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
export interface RestaurantsResponse {
    restaurants: Restaurant[];
    sessionCode: string;
}
export interface ErrorResponse {
    error: string;
    code: string;
    message: string;
    details?: Record<string, any>;
}
//# sourceMappingURL=api.d.ts.map