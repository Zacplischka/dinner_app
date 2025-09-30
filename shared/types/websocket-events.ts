// Shared TypeScript types for WebSocket events
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

// Note: Socket type imports are added in backend/frontend packages where socket.io is installed

// ============= Client → Server Events =============

export interface SessionJoinPayload {
  sessionCode: string;
  displayName: string;
}

export interface SessionJoinResponse {
  success: boolean;
  participantId?: string;
  sessionCode?: string;
  displayName?: string;
  participantCount?: number;
  participants?: Array<{
    participantId: string;
    displayName: string;
    isHost: boolean;
    isOnline?: boolean;
  }>;
  error?: string;
}

export interface SelectionSubmitPayload {
  sessionCode: string;
  selections: string[]; // optionId values
}

export interface SelectionSubmitResponse {
  success: boolean;
  error?: string;
}

export interface SessionRestartPayload {
  sessionCode: string;
}

export interface SessionRestartResponse {
  success: boolean;
  error?: string;
}

// ============= Server → Client Events =============

export interface WsDinnerOption {
  optionId: string;
  displayName: string;
  description?: string;
}

export interface ParticipantJoinedEvent {
  participantId: string;
  displayName: string;
  participantCount: number;
  isOnline?: boolean;
}

export interface ParticipantSubmittedEvent {
  participantId: string;
  submittedCount: number;
  participantCount: number;
}

export interface SessionResultsEvent {
  sessionCode: string;
  overlappingOptions: WsDinnerOption[];
  allSelections: Record<string, string[]>; // displayName -> optionIds
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
  isOnline?: boolean;
}

export interface ErrorEvent {
  code: string;
  message: string;
  details?: Record<string, any>;
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
}

export interface ServerToClientEvents {
  'participant:joined': (data: ParticipantJoinedEvent) => void;
  'participant:submitted': (data: ParticipantSubmittedEvent) => void;
  'session:results': (data: SessionResultsEvent) => void;
  'session:restarted': (data: SessionRestartedEvent) => void;
  'session:expired': (data: SessionExpiredEvent) => void;
  'participant:left': (data: ParticipantLeftEvent) => void;
  error: (data: ErrorEvent) => void;
}

// ============= Typed Socket Instances =============
// These type definitions are used in backend/frontend with actual socket.io imports