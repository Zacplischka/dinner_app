// Shared TypeScript types for WebSocket events
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

// Note: Socket type imports are added in backend/frontend packages where socket.io is installed

import type { ApiError } from './api-errors.js';

// ============= Canonical acknowledgement contract (ADR 0006 / #114) =============
// The final discriminated shape. `data` and failure never coexist — a success
// carries data, a failure carries exactly one public ApiError. The #115/#116
// frontend switch consumes this; the bridge response types below widen it with
// legacy fields so the currently-deployed frontend keeps working.

export type Ack<T> = { success: true; data: T } | { success: false; error: ApiError };

// ponytail: the failure-side bridge marker. Every command's bridge failure keeps
// the legacy human-readable `error: string` AND adds the canonical public error
// under a non-colliding `apiError` key (the #115 normalizer prefers `apiError`,
// falling back to the legacy string). remove `apiError` (and let `error` become
// ApiError per Ack<T>) after the frontend deployment consuming canonical acks is
// verified (#116).

// ============= Client → Server Events =============

export interface SessionJoinPayload {
  sessionCode: string;
  displayName: string;
}

/** Canonical success payload for session:join (the `data` of Ack<SessionJoinData>). */
export interface SessionJoinData {
  participantId: string;
  sessionCode: string;
  displayName: string;
  participantCount: number;
  participants: Array<{
    participantId: string;
    displayName: string;
    isHost: boolean;
  }>;
}

export interface SessionJoinResponse {
  success: boolean;
  /** Canonical success payload (bridge). Same values as the flattened fields below. */
  data?: SessionJoinData;
  // ponytail: legacy flattened success fields, duplicated by `data` during the
  // bridge. remove after the frontend deployment consuming canonical acks is
  // verified (#116).
  participantId?: string;
  sessionCode?: string;
  displayName?: string;
  participantCount?: number;
  participants?: SessionJoinData['participants'];
  /** Legacy human-readable failure text (kept through the bridge). */
  error?: string;
  // ponytail: canonical public error under a non-colliding key. remove after the
  // frontend deployment consuming canonical acks is verified (#116).
  apiError?: ApiError;
}

export interface SelectionSubmitPayload {
  sessionCode: string;
  selections: string[]; // optionId values
}

export interface SelectionSubmitResponse {
  success: boolean;
  /** Canonical: successful no-data commands acknowledge `data: null` (bridge → Ack<null>). */
  data?: null;
  /** Legacy human-readable failure text (kept through the bridge). */
  error?: string;
  // ponytail: canonical public error under a non-colliding key. remove after the
  // frontend deployment consuming canonical acks is verified (#116).
  apiError?: ApiError;
}

export interface SessionRestartPayload {
  sessionCode: string;
}

export interface SessionRestartResponse {
  success: boolean;
  /** Canonical: successful no-data commands acknowledge `data: null` (bridge → Ack<null>). */
  data?: null;
  /** Legacy human-readable failure text (kept through the bridge). */
  error?: string;
  // ponytail: canonical public error under a non-colliding key. remove after the
  // frontend deployment consuming canonical acks is verified (#116).
  apiError?: ApiError;
}

export interface SessionLeavePayload {
  sessionCode: string;
}

export interface SessionLeaveResponse {
  success: boolean;
  /** Canonical: successful no-data commands acknowledge `data: null` (bridge → Ack<null>). */
  data?: null;
  /** Legacy human-readable failure text (kept through the bridge). */
  error?: string;
  // ponytail: canonical public error under a non-colliding key. remove after the
  // frontend deployment consuming canonical acks is verified (#116).
  apiError?: ApiError;
}

// ============= Server → Client Events =============

export interface WsRestaurant {
  placeId: string;
  name: string;
  rating?: number;
  priceLevel?: number;
  cuisineType?: string;
  address?: string;
}

export interface ParticipantJoinedEvent {
  participantId: string;
  displayName: string;
  participantCount: number;
  /** Server-decided: this join replaced an existing participant's connection. */
  isRejoin: boolean;
}

export interface ParticipantSubmittedEvent {
  participantId: string;
  submittedCount: number;
  participantCount: number;
}

export interface SessionResultsEvent {
  sessionCode: string;
  overlappingOptions: WsRestaurant[];
  allSelections: Record<string, string[]>; // displayName -> placeIds
  restaurantNames: Record<string, string>; // placeId -> restaurant name (for displaying all selections)
  hasOverlap: boolean;
}

export interface SessionRestartedEvent {
  sessionCode: string;
  message: string;
}

export interface SessionExpiredEvent {
  sessionCode: string;
  reason: string;
  message: string;
}

export interface ParticipantLeftEvent {
  participantId: string;
  displayName: string;
  participantCount: number;
}

/**
 * Event emitted when a participant disconnects (network issue, browser close, etc.)
 * This is INFORMATIONAL only - the participant is NOT removed from the session (FR-025).
 * They can reconnect and will be re-registered with a new socket.id.
 */
export interface ParticipantDisconnectedEvent {
  participantId: string;
  displayName: string;
  participantCount: number; // Count unchanged - participant still in session
}

export interface ErrorEvent {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============= Socket.IO Typed Interfaces =============

export interface ClientToServerEvents {
  'session:join': (
    payload: SessionJoinPayload,
    callback: (response: SessionJoinResponse) => void
  ) => void;

  'selection:submit': (
    payload: SelectionSubmitPayload,
    callback: (response: SelectionSubmitResponse) => void
  ) => void;

  'session:restart': (
    payload: SessionRestartPayload,
    callback: (response: SessionRestartResponse) => void
  ) => void;

  'session:leave': (
    payload: SessionLeavePayload,
    callback: (response: SessionLeaveResponse) => void
  ) => void;
}

export interface ServerToClientEvents {
  'participant:joined': (data: ParticipantJoinedEvent) => void;
  'participant:submitted': (data: ParticipantSubmittedEvent) => void;
  'session:results': (data: SessionResultsEvent) => void;
  'session:restarted': (data: SessionRestartedEvent) => void;
  'session:expired': (data: SessionExpiredEvent) => void;
  'participant:left': (data: ParticipantLeftEvent) => void;
  'participant:disconnected': (data: ParticipantDisconnectedEvent) => void;
  error: (data: ErrorEvent) => void;
}

// ============= Typed Socket Instances =============
// These type definitions are used in backend/frontend with actual socket.io imports
