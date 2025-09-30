// Shared TypeScript types for REST API
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

export interface CreateSessionRequest {
  hostName: string;
}

export interface SessionResponse {
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: 'waiting' | 'selecting' | 'complete' | 'expired';
  expiresAt: string; // ISO 8601 timestamp
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