// Shared TypeScript types for WebSocket events
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

// Note: Socket type imports are added in backend/frontend packages where socket.io is installed

import type { ApiError } from './api-errors.js';
import type { MenuItemCapture } from './comparison.js';

// ============= Canonical acknowledgement contract (ADR 0006 / #114) =============
// The final discriminated shape. `data` and failure never coexist — a success
// carries data, a failure carries exactly one public ApiError. Every command
// acknowledges with this shape; no legacy flattened fields or string errors.

export type Ack<T> = { success: true; data: T } | { success: false; error: ApiError };

// ============= Client → Server Events =============

export interface SessionJoinPayload {
  sessionCode: string;
  displayName: string;
  rejoinToken?: string;
}

/** Canonical success payload for session:join (the `data` of Ack<SessionJoinData>). */
export interface SessionJoinData {
  participantId: string;
  sessionCode: string;
  displayName: string;
  participantCount: number;
  rejoinToken: string;
  participants: Array<{
    participantId: string;
    displayName: string;
    isHost: boolean;
  }>;
}

/** session:join acknowledges the canonical success data or a public error. */
export type SessionJoinResponse = Ack<SessionJoinData>;

export interface SelectionSubmitPayload {
  sessionCode: string;
  selections: string[]; // optionId values
}

/** No-data command: success acknowledges `data: null`. */
export type SelectionSubmitResponse = Ack<null>;

export interface SessionRestartPayload {
  sessionCode: string;
}

/** No-data command: success acknowledges `data: null`. */
export type SessionRestartResponse = Ack<null>;

export interface SessionLeavePayload {
  sessionCode: string;
}

/** No-data command: success acknowledges `data: null`. */
export type SessionLeaveResponse = Ack<null>;

/**
 * A Live Selection: this Participant just swiped yes on placeId, mid-deck.
 * Fire-and-forget chrome — the Selection is NOT persisted here; the Match is
 * still computed from `selection:submit`.
 */
export interface SelectionLivePayload {
  sessionCode: string;
  placeId: string;
}

/** No-data command: success acknowledges `data: null`. */
export type SelectionLiveResponse = Ack<null>;

// ============= Server → Client Events =============

export interface WsRestaurant {
  placeId: string;
  name: string;
  rating?: number;
  priceLevel?: number;
  cuisineType?: string;
  address?: string;
  /** Already sent at runtime by every producer; declared so the crown can render a hero. */
  photoUrl?: string;
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

/** The single Restaurant a completed Session crowns, and why it won. */
export interface TopPick {
  restaurant: WsRestaurant;
  /** Participants who selected it. 0 when nobody selected anything. */
  likedBy: number;
  /** Participants counted in the tally (Object.keys(allSelections).length). */
  of: number;
}

export interface SessionResultsEvent {
  sessionCode: string;
  overlappingOptions: WsRestaurant[];
  allSelections: Record<string, string[]>; // displayName -> placeIds
  restaurantNames: Record<string, string>; // placeId -> restaurant name (for displaying all selections)
  hasOverlap: boolean;
  /** Additive (ADR 0007): absent from an older backend; a Session with zero Restaurants has none. */
  topPick?: TopPick;
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

/**
 * Another Participant made a Live Selection. The UI renders counts only — `displayName`
 * is never shown; it is the reconnect-stable key the receiver's buffer is indexed by
 * (see ADR 0009). `participantId` is socket-scoped and carried only for parity with the
 * other participant:* events.
 */
export interface ParticipantSelectedEvent {
  participantId: string;
  displayName: string;
  placeId: string;
}

// ============= Group Order =============

export type OrderPlatform = 'ubereats' | 'doordash';

export interface OrderLine {
  index: number; // array index into the Pinned Menu
  name: string; // resolved server-side from the Pinned Menu
  priceCents: number; // resolved server-side from the Pinned Menu
  qty: number;
  by: string; // displayName
}

export interface OrderShare {
  displayName: string;
  itemsCents: number;
  feeCents: number; // this person's slice of the Buyer's fee
  totalCents: number; // itemsCents + feeCents
}

export interface OrderState {
  sessionCode: string;
  placeId: string;
  venueName: string;
  platform: OrderPlatform;
  storeUrl?: string;
  pricesAt: string; // ISO, the Snapshot's fetchedAt
  cheaperPercent?: number; // only when cheaperMenu named this platform
  lines: OrderLine[];
  buyer?: string; // displayName
  feeCents: number;
  itemsCents: number;
  totalCents: number; // itemsCents + feeCents
  shares: OrderShare[];
  state: 'building' | 'locked';
  /** Present ONLY on the order:open ack — the ~4 KB Pinned Menu. */
  menu?: MenuItemCapture[];
}

export interface OrderOpenPayload {
  sessionCode: string;
  placeId: string;
}

/** NOT_FOUND carries a machine-readable reason so the page knows whether to retry. */
export interface OrderUnavailableError extends ApiError {
  code: 'NOT_FOUND';
  reason: 'stale' | 'no_menu';
}
export type OrderOpenResponse = Ack<OrderState> | { success: false; error: OrderUnavailableError };

export interface OrderItemPayload {
  sessionCode: string;
  index: number;
  delta: 1 | -1;
}
export type OrderItemResponse = Ack<null>;

export interface OrderBuyPayload {
  sessionCode: string;
  feeCents?: number;
}
export type OrderBuyResponse = Ack<null>;

export interface OrderStateEvent {
  sessionCode: string;
  order: OrderState;
  /** What this broadcast was caused by. Absent on the open/reconnect emit. */
  change?: { by: string; name: string; delta: 1 | -1 };
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

  'selection:live': (
    payload: SelectionLivePayload,
    callback: (response: SelectionLiveResponse) => void
  ) => void;

  'order:open': (payload: OrderOpenPayload, callback: (r: OrderOpenResponse) => void) => void;
  'order:item': (payload: OrderItemPayload, callback: (r: OrderItemResponse) => void) => void;
  'order:buy': (payload: OrderBuyPayload, callback: (r: OrderBuyResponse) => void) => void;
}

export interface ServerToClientEvents {
  'participant:joined': (data: ParticipantJoinedEvent) => void;
  'participant:submitted': (data: ParticipantSubmittedEvent) => void;
  'session:results': (data: SessionResultsEvent) => void;
  'session:restarted': (data: SessionRestartedEvent) => void;
  'session:expired': (data: SessionExpiredEvent) => void;
  'participant:left': (data: ParticipantLeftEvent) => void;
  'participant:disconnected': (data: ParticipantDisconnectedEvent) => void;
  'participant:selected': (data: ParticipantSelectedEvent) => void;
  'order:state': (data: OrderStateEvent) => void;
  error: (data: ErrorEvent) => void;
}

// ============= Typed Socket Instances =============
// These type definitions are used in backend/frontend with actual socket.io imports
