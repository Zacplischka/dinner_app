# WebSocket Events Contract

**Protocol**: Socket.IO 4.x
**Transport**: WebSocket (fallback to polling)
**Feature**: 001-dinner-decider-enables
**Version**: 1.0.0
**Date**: 2025-09-30

---

## Overview

Real-time bidirectional communication for session management, participant visibility, and result broadcasting. All events use Socket.IO rooms where `room = sessionCode`.

**Architecture Pattern**: Room-based event-driven state machine
- Each session = 1 Socket.IO room
- Participants join room on session join
- Server broadcasts events to room based on session state
- Selective broadcasting enforces privacy rules (FR-023)

**Design Alignment**:
- REST API (openapi.yaml) handles session creation: POST /api/sessions
- WebSocket handles real-time updates: joins, submissions, results
- Redis (data-model.md) provides session state: HSET, SADD, SINTER
- Socket.IO Connection State Recovery (research.md) handles brief disconnects

---

## Connection Lifecycle

### Client Connection Flow

1. **Client connects**: `socket.connect()`
2. **Server assigns socket.id**: Unique identifier per connection
3. **Client sends `session:join`**: Joins existing session (created via REST API)
4. **Server adds socket to room**: `socket.join(sessionCode)`
5. **Client listens for broadcasts**: Real-time updates from other participants

### Connection Configuration

```typescript
// Client-side (frontend/src/services/socketService.ts)
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling'],  // Prefer WebSocket, fallback to polling
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    socket.connect();  // Manual reconnect if server kicked
  }
  // Otherwise auto-reconnect handles it
});
```

### Connection State Recovery

Socket.IO 4.6+ automatically replays missed events during brief disconnects:

```typescript
// Server-side (backend/src/server.ts)
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,  // 2 minutes
    skipMiddlewares: true
  }
});

io.on('connection', (socket) => {
  if (socket.recovered) {
    console.log('Socket recovered, events replayed');
  }
});
```

---

## Client → Server Events

### `session:join`

**Purpose**: Join an existing session and receive current state

**Trigger**: User enters session code and display name

**Payload**:
```typescript
{
  sessionCode: string;     // 6-character alphanumeric (e.g., "ABC123")
  displayName: string;     // 1-50 characters
}
```

**Validation**:
- `sessionCode`: Must match regex `^[A-Z0-9]{6}$`
- `displayName`: Required, 1-50 characters
- Session must exist in Redis (check: `EXISTS session:{sessionCode}`)
- Session must have < 4 participants (check: `SCARD session:{sessionCode}:participants < 4`)

**Server Actions**:
1. Validate payload against Zod schema
2. Check session exists and is not full
3. Add participant to Redis: `SADD session:{sessionCode}:participants {socket.id}`
4. Store participant metadata: `HSET participant:{socket.id} displayName "{displayName}" sessionCode "{sessionCode}"`
5. Join Socket.IO room: `socket.join(sessionCode)`
6. Refresh session TTL: `EXPIREAT session:{sessionCode} {timestamp + 1800}`
7. Send acknowledgment to joining client
8. Broadcast `participant:joined` to all OTHER participants

**Response** (acknowledgment to joining client only):
```typescript
{
  success: boolean;
  participantId?: string;      // Socket ID
  sessionCode?: string;
  displayName?: string;
  participantCount?: number;   // Total after join
  participants?: Array<{       // All current participants
    participantId: string;
    displayName: string;
    isHost: boolean;
  }>;
  error?: string;              // If failed: "Session full", "Session not found"
}
```

**Broadcast** (to all OTHER participants in room):
```typescript
socket.to(sessionCode).emit('participant:joined', {
  participantId: string;
  displayName: string;
  participantCount: number;  // Updated total
});
```

**Error Codes**:
- `SESSION_FULL`: 4 participants already in session (FR-005)
- `SESSION_NOT_FOUND`: Session does not exist or has expired
- `VALIDATION_ERROR`: Invalid sessionCode or displayName

**Example**:
```typescript
// Client-side
socket.emit('session:join', {
  sessionCode: 'ABC123',
  displayName: 'Bob'
}, (response) => {
  if (response.success) {
    console.log('Joined session:', response.sessionCode);
    console.log('Participants:', response.participants);
  } else {
    console.error('Join failed:', response.error);
  }
});

socket.on('participant:joined', (data) => {
  console.log('New participant:', data.displayName);
  console.log('Total participants:', data.participantCount);
});
```

**Specification Mapping**: FR-004, FR-005, FR-017, FR-022

---

### `selection:submit`

**Purpose**: Submit participant's dinner selections (private until all submit)

**Trigger**: User selects options and clicks "Submit Selections"

**Payload**:
```typescript
{
  sessionCode: string;       // 6-character alphanumeric
  selections: string[];      // Array of optionId values (e.g., ["pizza-palace", "sushi-spot"])
}
```

**Validation**:
- `sessionCode`: Must exist in Redis
- `selections`: Must contain at least 1 optionId
- All `optionId` values must exist in static DINNER_OPTIONS list
- Participant must not have already submitted (check Redis: `SCARD session:{sessionCode}:{socket.id}:selections == 0`)

**Server Actions**:
1. Validate payload against Zod schema
2. Verify participant is in session
3. Check not already submitted (FR-026: locked after submit)
4. Store selections: `SADD session:{sessionCode}:{socket.id}:selections {optionId1} {optionId2} ...`
5. Refresh session TTL
6. Send acknowledgment to submitting client
7. Broadcast `participant:submitted` to all OTHER participants (count only, not selections per FR-023)
8. If all participants submitted: Calculate overlap and broadcast `session:results` to all

**Response** (acknowledgment to submitting client only):
```typescript
{
  success: boolean;
  error?: string;
}
```

**Broadcast** (to all OTHER participants):
```typescript
socket.to(sessionCode).emit('participant:submitted', {
  participantId: string;     // Who submitted (not WHAT they submitted)
  submittedCount: number;    // How many have submitted so far
  participantCount: number;  // Total participants
});
```

**Automatic Trigger** (when all submitted):
```typescript
io.in(sessionCode).emit('session:results', {
  sessionCode: string;
  overlappingOptions: DinnerOption[];  // Calculated via SINTER
  allSelections: Record<string, string[]>;  // displayName -> optionId[]
  hasOverlap: boolean;
});
```

**Error Codes**:
- `ALREADY_SUBMITTED`: Participant has already submitted (FR-026)
- `INVALID_OPTIONS`: One or more optionId values don't exist
- `SESSION_NOT_FOUND`: Session expired or doesn't exist

**Example**:
```typescript
// Client-side
socket.emit('selection:submit', {
  sessionCode: 'ABC123',
  selections: ['pizza-palace', 'sushi-spot', 'thai-kitchen']
}, (response) => {
  if (response.success) {
    console.log('Selections submitted, waiting for others...');
  }
});

socket.on('participant:submitted', (data) => {
  console.log(`${data.submittedCount}/${data.participantCount} have submitted`);
});
```

**Specification Mapping**: FR-007, FR-008, FR-009, FR-023, FR-026

---

### `session:restart`

**Purpose**: Clear selections and results, restart session with same participants

**Trigger**: User clicks "Restart Session" button on results screen (FR-012)

**Payload**:
```typescript
{
  sessionCode: string;
}
```

**Validation**:
- `sessionCode`: Must exist in Redis
- Participant must be in session (check: `SISMEMBER session:{sessionCode}:participants {socket.id}`)

**Authorization**: Any participant can restart (no host-only restriction per spec)

**Server Actions**:
1. Validate payload
2. Delete all selections: `DEL session:{sessionCode}:{participantId1}:selections ...`
3. Delete results: `DEL session:{sessionCode}:results`
4. Update session state: `HSET session:{sessionCode} state "selecting"`
5. Refresh session TTL
6. Broadcast `session:restarted` to all participants

**Response** (acknowledgment):
```typescript
{
  success: boolean;
  error?: string;
}
```

**Broadcast** (to all participants including sender):
```typescript
io.in(sessionCode).emit('session:restarted', {
  sessionCode: string;
  message: string;  // "Session restarted. Make new selections."
});
```

**State Changes**:
- Session state: `complete` → `selecting`
- All selections cleared
- Results cleared
- Participant list preserved (FR-013)
- Session TTL refreshed

**Example**:
```typescript
// Client-side
socket.emit('session:restart', {
  sessionCode: 'ABC123'
}, (response) => {
  if (response.success) {
    console.log('Session restarted');
  }
});

socket.on('session:restarted', (data) => {
  console.log(data.message);
  // Navigate back to selection screen
});
```

**Specification Mapping**: FR-012, FR-013

---

## Server → Client Events (Broadcasts)

### `participant:joined`

**Purpose**: Notify all participants when someone joins the session

**Trigger**: After successful `session:join` processing

**Target**: Broadcast to all participants in room EXCEPT the joiner (joiner receives acknowledgment instead)

**Payload**:
```typescript
{
  participantId: string;      // Socket ID of new participant
  displayName: string;        // Name of new participant
  participantCount: number;   // Updated total (1-4)
}
```

**UI Action**: Add participant name to "Who's here" list, update count badge

**Example**:
```typescript
// Client-side
socket.on('participant:joined', (data) => {
  console.log(`${data.displayName} joined`);
  console.log(`Total participants: ${data.participantCount}`);
  // Update UI: Add to participant list
});
```

**Specification Mapping**: FR-022 (show names when joining)

---

### `participant:submitted`

**Purpose**: Notify participants when someone submits selections (count only, not content)

**Trigger**: After successful `selection:submit` processing

**Target**: Broadcast to all participants in room EXCEPT the submitter

**Payload**:
```typescript
{
  participantId: string;      // Socket ID of submitter
  submittedCount: number;     // How many have submitted (e.g., 2)
  participantCount: number;   // Total participants (e.g., 3)
}
```

**Privacy**: Does NOT reveal what the participant selected (FR-023)

**UI Action**: Update progress indicator: "2/3 participants have submitted"

**Example**:
```typescript
// Client-side
socket.on('participant:submitted', (data) => {
  console.log(`${data.submittedCount}/${data.participantCount} submitted`);
  // Update UI: Show progress bar
});
```

**Specification Mapping**: FR-023 (hide activity during selection)

---

### `session:results`

**Purpose**: Broadcast calculated overlap results when all participants submit

**Trigger**: Last participant submits selections (all submitted count == participant count)

**Target**: Broadcast to all participants in room (including last submitter)

**Payload**:
```typescript
{
  sessionCode: string;
  overlappingOptions: Array<{
    optionId: string;
    displayName: string;
    description?: string;
  }>;
  allSelections: Record<string, string[]>;  // displayName -> optionId[]
  hasOverlap: boolean;                      // True if overlappingOptions.length > 0
}
```

**Calculation** (server-side):
```typescript
// Get all participant socket IDs
const participantIds = await redis.sMembers(`session:${sessionCode}:participants`);

// Calculate intersection using Redis SINTER
const overlap = await redis.sInter(
  participantIds.map(id => `session:${sessionCode}:${id}:selections`)
);

// Map to DinnerOption objects
const overlappingOptions = overlap.map(optionId =>
  DINNER_OPTIONS.find(opt => opt.optionId === optionId)
);

// Get all selections with display names for transparency
const allSelections = {};
for (const participantId of participantIds) {
  const participant = await redis.hGetAll(`participant:${participantId}`);
  const selections = await redis.sMembers(`session:${sessionCode}:${participantId}:selections`);
  allSelections[participant.displayName] = selections;
}
```

**UI Action**:
- Navigate to Results screen
- Display overlapping options prominently
- Show all participants' selections for transparency
- If no overlap: Show "No matching options" message with restart button

**Example Payload**:
```json
{
  "sessionCode": "ABC123",
  "overlappingOptions": [
    {
      "optionId": "sushi-spot",
      "displayName": "Sushi Spot",
      "description": "Japanese cuisine"
    },
    {
      "optionId": "thai-kitchen",
      "displayName": "Thai Kitchen",
      "description": "Thai cuisine"
    }
  ],
  "allSelections": {
    "Alice": ["pizza-palace", "sushi-spot", "thai-kitchen"],
    "Bob": ["sushi-spot", "thai-kitchen", "mexican-grill"],
    "Charlie": ["thai-kitchen", "sushi-spot", "indian-curry"]
  },
  "hasOverlap": true
}
```

**Example (client-side)**:
```typescript
socket.on('session:results', (data) => {
  console.log('Results ready!');
  console.log('Overlapping options:', data.overlappingOptions);
  console.log('Everyone selected:', data.allSelections);

  if (!data.hasOverlap) {
    console.log('No matching options (FR-016)');
    // Show restart button
  }
});
```

**Specification Mapping**: FR-009, FR-010, FR-011, FR-016, FR-021

---

### `session:restarted`

**Purpose**: Notify all participants that session has been reset

**Trigger**: After successful `session:restart` processing

**Target**: Broadcast to all participants in room (including requester)

**Payload**:
```typescript
{
  sessionCode: string;
  message: string;  // "Session restarted. Make new selections."
}
```

**UI Action**:
- Navigate back to Selection screen
- Clear previous selections from UI
- Show "Session restarted" toast notification

**Example**:
```typescript
// Client-side
socket.on('session:restarted', (data) => {
  console.log(data.message);
  // Clear selections state
  useSessionStore.getState().clearSelections();
  // Navigate to selection screen
  navigate(`/session/${data.sessionCode}/select`);
});
```

**Specification Mapping**: FR-012, FR-013

---

### `session:expired`

**Purpose**: Notify participants that session expired due to 30-minute inactivity

**Trigger**: Redis TTL expiration detected or explicit expiration check

**Target**: Broadcast to all participants in room

**Payload**:
```typescript
{
  sessionCode: string;
  reason: string;  // "Session expired due to inactivity"
  message: string;  // "This session has expired. Please create a new one."
}
```

**Server Actions** (before broadcast):
- Session automatically deleted by Redis TTL (FR-019)
- All related keys (participants, selections, results) also expired via same TTL

**UI Action**:
- Show "Session expired" modal
- Disable all interaction
- Offer "Create New Session" button
- Clear session state from local storage

**Example**:
```typescript
// Client-side
socket.on('session:expired', (data) => {
  console.log('Session expired:', data.reason);
  // Show modal
  alert(data.message);
  // Clear state and redirect to home
  useSessionStore.getState().resetSession();
  navigate('/');
});
```

**Specification Mapping**: FR-019, FR-020

---

### `participant:left`

**Purpose**: Notify when a participant disconnects (MVP behavior: for display only, doesn't remove from session)

**Trigger**: Socket disconnect event (`socket.on('disconnect')`)

**Target**: Broadcast to all remaining participants

**Payload**:
```typescript
{
  participantId: string;
  displayName: string;
  participantCount: number;  // Remains same (not removed per FR-025)
}
```

**Server Behavior** (per clarifications FR-025):
- Participant is NOT removed from session
- Selections are NOT deleted
- Session stays in waiting state if they haven't submitted
- 30-minute TTL continues
- If they reconnect: Re-join with same participantId

**UI Action**: Show "{displayName} disconnected" message (temporary)

**Example**:
```typescript
// Client-side
socket.on('participant:left', (data) => {
  console.log(`${data.displayName} disconnected`);
  // Show temporary notification, but keep in participant list
});
```

**Specification Mapping**: FR-025 (session stays in waiting state until reconnect or expire)

---

### `error`

**Purpose**: Server error notification

**Target**: Specific client (not broadcast)

**Payload**:
```typescript
{
  code: string;              // Machine-readable error code
  message: string;           // Human-readable error message
  details?: Record<string, any>;  // Optional additional context
}
```

**Error Codes**:
- `SESSION_FULL`: Cannot join, 4 participants already in session (FR-005)
- `SESSION_NOT_FOUND`: Session does not exist or has expired
- `VALIDATION_ERROR`: Invalid payload (missing fields, wrong types)
- `ALREADY_SUBMITTED`: Participant has already submitted selections (FR-026)
- `INVALID_OPTIONS`: One or more optionId values don't exist in static list
- `INTERNAL_ERROR`: Unexpected server error (Redis connection, etc.)

**UI Action**: Show error message based on code

**Example**:
```typescript
// Client-side
socket.on('error', (error) => {
  console.error('WebSocket error:', error.code, error.message);

  switch (error.code) {
    case 'SESSION_FULL':
      alert('This session is full (4 participants maximum)');
      navigate('/');
      break;
    case 'SESSION_NOT_FOUND':
      alert('Session not found or expired');
      navigate('/');
      break;
    case 'ALREADY_SUBMITTED':
      alert('You have already submitted your selections');
      break;
    default:
      alert(`Error: ${error.message}`);
  }
});
```

---

## Event Sequence Diagrams

### Happy Path: 3 Participants with Overlap

```
Alice (Client)          Server (Redis)       Bob (Client)           Charlie (Client)
     |                       |                     |                        |
     |-- POST /sessions ---->|                     |                        |
     |<-- 201 {code:ABC123}--|                     |                        |
     |                       |                     |                        |
     |-- session:join ------->|                    |                        |
     |<-- ack (success) ------|                    |                        |
     |                       |<---- session:join --|                        |
     |<- participant:joined --|                    |                        |
     |                       |--- ack (success) -->|                        |
     |                       |                     |<----- session:join ----|
     |<- participant:joined --|                    |                        |
     |                       |<- participant:joined|                        |
     |                       |---- ack (success) ---------- session:join -->|
     |                       |                     |                        |
     |-- selection:submit --->|                    |                        |
     |<-- ack (success) ------|                    |                        |
     |                       |<- participant:submitted                      |
     |                       |                     |<- participant:submitted|
     |                       |<--- selection:submit|                        |
     |<- participant:submitted|<-- ack (success) --|                        |
     |                       |                     |<- participant:submitted|
     |                       |<----------------------- selection:submit ----|
     |<- participant:submitted|<- participant:submitted|<-- ack (success) --|
     |                       |                     |                        |
     |                       | [Calculate SINTER]  |                        |
     |<---- session:results --|<---- session:results|<----- session:results-|
     |  (overlap: sushi, thai)|                    |                        |
```

### No Overlap Path: Session Restart

```
Alice                   Server                  Bob
  |                       |                      |
  | [All submit, no overlap via SINTER]         |
  |<---- session:results --|<---- session:results|
  |    (hasOverlap: false) |                     |
  |                        |                     |
  |-- session:restart ---->|                     |
  |<-- ack (success) ------|                     |
  |<--- session:restarted --|<-- session:restarted|
  |                        |                     |
  | [Navigate to selection screen]              |
```

### Session Expiration (30 minutes)

```
Alice                   Server (Redis)          Bob
  |                        |                     |
  | [30 minutes of inactivity]                  |
  |                        |                     |
  |                        | [TTL expires]       |
  |                        | [All keys deleted]  |
  |<--- session:expired ---|<--- session:expired-|
  |                        |                     |
  | [Navigate to home]     |                     |
```

---

## TypeScript Type Definitions

```typescript
// shared/types/websocket-events.ts

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
  }>;
  error?: string;
}

export interface SelectionSubmitPayload {
  sessionCode: string;
  selections: string[];  // optionId values
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

export interface DinnerOption {
  optionId: string;
  displayName: string;
  description?: string;
}

export interface ParticipantJoinedEvent {
  participantId: string;
  displayName: string;
  participantCount: number;
}

export interface ParticipantSubmittedEvent {
  participantId: string;
  submittedCount: number;
  participantCount: number;
}

export interface SessionResultsEvent {
  sessionCode: string;
  overlappingOptions: DinnerOption[];
  allSelections: Record<string, string[]>;  // displayName -> optionId[]
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
  'error': (data: ErrorEvent) => void;
}

// ============= Typed Socket Instances =============

import { Socket as ServerSocket } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';

export type TypedServerSocket = ServerSocket<ClientToServerEvents, ServerToClientEvents>;
export type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
```

---

## Zod Validation Schemas

```typescript
// shared/schemas/websocket-events.ts
import { z } from 'zod';

// Client → Server schemas
export const sessionJoinPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/, 'Session code must be 6 alphanumeric characters'),
  displayName: z.string().min(1, 'Display name required').max(50, 'Display name too long')
});

export const selectionSubmitPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
  selections: z.array(z.string()).min(1, 'Must select at least 1 option').max(50)
});

export const sessionRestartPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/)
});

// Server → Client schemas (for client-side validation)
export const sessionResultsEventSchema = z.object({
  sessionCode: z.string(),
  overlappingOptions: z.array(z.object({
    optionId: z.string(),
    displayName: z.string(),
    description: z.string().optional()
  })),
  allSelections: z.record(z.array(z.string())),
  hasOverlap: z.boolean()
});

export const errorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional()
});
```

---

## Testing Strategy

### Contract Tests

```typescript
// backend/tests/integration/websocket.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { sessionJoinPayloadSchema } from '../../../shared/schemas/websocket-events';

describe('WebSocket Events - Contract Tests', () => {
  let clientSocket: ClientSocket;

  beforeEach((done) => {
    clientSocket = ioClient('http://localhost:3001');
    clientSocket.on('connect', done);
  });

  afterEach(() => {
    clientSocket.close();
  });

  it('should validate session:join payload schema', (done) => {
    const payload = {
      sessionCode: 'ABC123',
      displayName: 'Alice'
    };

    // Schema validation
    expect(() => sessionJoinPayloadSchema.parse(payload)).not.toThrow();

    clientSocket.emit('session:join', payload, (response) => {
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('participantId');
      done();
    });
  });

  it('should broadcast participant:joined to other clients', (done) => {
    // Create second client
    const client2 = ioClient('http://localhost:3001');

    client2.on('participant:joined', (data) => {
      expect(data).toHaveProperty('displayName');
      expect(data).toHaveProperty('participantCount');
      client2.close();
      done();
    });
  });
});
```

---

## Performance Considerations

**Event Frequency** (per session):
- `participant:joined`: Max 4 per session (low)
- `selection:submit`: Max 4 per session per round (low)
- `participant:submitted`: Max 4 broadcasts per round (low)
- `session:results`: 1 per session per round (low)

**Broadcast Strategy**:
- Use Socket.IO rooms (not global broadcast)
- Max 4 clients per room → minimal overhead
- Selective broadcasting reduces network traffic

**Message Size**:
- Largest payload: `session:results` with 4 participants × 15 selections each
- Estimated size: ~4KB (well within WebSocket frame limits)
- JSON compression available via Socket.IO

**Latency Targets**:
- WebSocket broadcast: <200ms p95 (per research.md)
- Event acknowledgment: <100ms p95
- SINTER overlap calculation: <50ms (15 options × 4 participants)

---

## Related Documents

- [REST API Contract](./openapi.yaml) - Session creation via POST /api/sessions
- [Data Model](../data-model.md) - Redis data structures and TTL strategy
- [Research](../research.md) - Socket.IO architecture decisions
- [Feature Specification](../spec.md) - Functional requirements and clarifications