# Data Model: Dinner Decider

**Feature**: 001-dinner-decider-enables
**Date**: 2025-09-30
**Storage**: Redis 7.x (in-memory with TTL)

---

## Overview

The Dinner Decider uses Redis as the single source of truth for ephemeral session state. All data automatically expires after 30 minutes of inactivity (FR-019). The model optimizes for:

- **Fast overlap calculation**: Set-based storage enables O(N*M) SINTER operations
- **Atomic TTL management**: All session keys share the same EXPIREAT timestamp
- **Memory efficiency**: Hash ziplist encoding and Set intset encoding reduce memory footprint by 50-70%
- **Real-time updates**: Simple key patterns enable efficient WebSocket broadcasting

---

## Entities

### 1. Session

**Purpose**: Represents a dinner decision session with 1-4 participants

**Redis Structure**: Hash (`session:{sessionCode}`)

**Fields**:
- `createdAt` (Unix timestamp): Session creation time for TTL tracking
- `hostId` (string, UUID): Socket ID of session creator
- `state` (enum: "waiting" | "selecting" | "complete" | "expired"): Current session state
- `participantCount` (integer, 1-4): Current number of participants (enforces FR-004, FR-005)
- `lastActivityAt` (Unix timestamp): Last activity for TTL refresh calculation

**Validation Rules**:
- `sessionCode`: 6-character alphanumeric, uppercase (e.g., "ABC123")
- `participantCount`: Must be between 1 and 4 (inclusive)
- `state`: Transitions: waiting → selecting → complete | expired

**State Transitions**:
```
waiting      → selecting    (first participant joins)
selecting    → complete     (all participants submit selections, overlap found)
selecting    → expired      (30-minute TTL expires)
complete     → selecting    (session restart via FR-012, FR-013)
```

**TTL Behavior**:
- Automatically expires 30 minutes after `lastActivityAt`
- Refreshed on: join, selection, submit, view results
- Deletion cascades to all related keys (participants, selections, results)

**Example**:
```bash
HSET session:ABC123 \
  createdAt 1709251200 \
  hostId "socket-uuid-1" \
  state "selecting" \
  participantCount 3 \
  lastActivityAt 1709251800

EXPIREAT session:ABC123 1709253600  # 30 min from lastActivityAt
```

---

### 2. Participant

**Purpose**: Represents an individual in a session

**Redis Structure**: Set membership (`session:{sessionCode}:participants`)

**Fields** (stored in separate Hash per participant):
- `participantId` (string, UUID): Unique identifier (Socket.IO socket ID)
- `displayName` (string, 1-50 chars): User-provided name visible to others (FR-022)
- `joinedAt` (Unix timestamp): When participant joined session
- `hasSubmitted` (boolean): Whether selections have been submitted (hidden from others per FR-023)
- `isHost` (boolean): Whether participant created the session

**Validation Rules**:
- `displayName`: Non-empty, max 50 characters, no sanitization (honor system per FR-024)
- Maximum 4 participants per session (enforced by checking Set cardinality before SADD)

**Participant Metadata Storage**:
```bash
# Participant membership in session
SADD session:ABC123:participants "socket-uuid-1" "socket-uuid-2" "socket-uuid-3"
EXPIREAT session:ABC123:participants 1709253600

# Individual participant metadata (optional, for display name lookup)
HSET participant:socket-uuid-1 \
  displayName "Alice" \
  sessionCode "ABC123" \
  joinedAt 1709251200 \
  isHost true

EXPIREAT participant:socket-uuid-1 1709253600
```

**Cardinality Check** (before adding participant):
```bash
SCARD session:ABC123:participants  # Returns current count
# If count >= 4, reject join (FR-005)
```

---

### 3. Dinner Option

**Purpose**: Represents a single restaurant or dining choice from the static list

**Redis Structure**: N/A (hardcoded in application, not stored in Redis)

**Fields** (application-level model):
- `optionId` (string, unique): Unique identifier (e.g., "pizza-palace")
- `displayName` (string): User-visible restaurant name (e.g., "Pizza Palace")
- `description` (string, optional): Brief description (e.g., "Italian cuisine, delivery available")

**Validation Rules**:
- Static list defined in application code (FR-018)
- No duplicate `optionId` values (validated at application startup)
- Same list presented to all sessions and participants

**Example Application Definition**:
```typescript
// backend/src/constants/dinnerOptions.ts
export const DINNER_OPTIONS = [
  { optionId: 'pizza-palace', displayName: 'Pizza Palace', description: 'Italian cuisine' },
  { optionId: 'sushi-spot', displayName: 'Sushi Spot', description: 'Japanese cuisine' },
  { optionId: 'thai-kitchen', displayName: 'Thai Kitchen', description: 'Thai cuisine' },
  // ... 10-20 total options
];
```

---

### 4. Selection

**Purpose**: Represents a participant's chosen dinner options (private until all submit per FR-008)

**Redis Structure**: Set per participant (`session:{sessionCode}:{participantId}:selections`)

**Fields**:
- Set members: `optionId` values from the static DINNER_OPTIONS list

**Validation Rules**:
- Must contain at least 1 option (enforced at submission)
- Cannot exceed total number of available options
- All `optionId` values must exist in static DINNER_OPTIONS list

**Privacy Enforcement**:
- Selections remain private (not broadcast via WebSocket) until all participants submit (FR-023)
- Only submission status is visible: "ParticipantX submitted" without revealing choices

**Example**:
```bash
# Alice's selections
SADD session:ABC123:socket-uuid-1:selections "pizza-palace" "sushi-spot" "thai-kitchen"
EXPIREAT session:ABC123:socket-uuid-1:selections 1709253600

# Bob's selections
SADD session:ABC123:socket-uuid-2:selections "sushi-spot" "thai-kitchen" "mexican-grill"
EXPIREAT session:ABC123:socket-uuid-2:selections 1709253600

# Charlie's selections
SADD session:ABC123:socket-uuid-3:selections "thai-kitchen" "indian-curry" "sushi-spot"
EXPIREAT session:ABC123:socket-uuid-3:selections 1709253600
```

---

### 5. Result

**Purpose**: Represents the overlapping choices calculated from all participants' selections (FR-009, FR-010)

**Redis Structure**: Set (`session:{sessionCode}:results`)

**Fields**:
- Set members: `optionId` values that ALL participants selected (intersection)

**Calculation**:
```bash
# Calculate overlap using Redis SINTER (O(N*M) where N = smallest set size)
SINTER \
  session:ABC123:socket-uuid-1:selections \
  session:ABC123:socket-uuid-2:selections \
  session:ABC123:socket-uuid-3:selections

# Result: ["sushi-spot", "thai-kitchen"] (common to all three)

# Store result
SADD session:ABC123:results "sushi-spot" "thai-kitchen"
EXPIREAT session:ABC123:results 1709253600
```

**Edge Cases**:
- **No overlap**: Empty set (FR-016 - no automated fallback)
- **Single participant**: Result = participant's selections (FR-021)
- **Restart session**: Clears previous results, participants re-select (FR-012, FR-013)

**Broadcast Timing**:
- Results broadcast only when all participants submit (FR-011)
- WebSocket event: `session:results` with overlapping option details

---

## Key Relationships

```
Session (1)
  ├─ Participants (1-4)  [session:{code}:participants Set]
  │   └─ Metadata  [participant:{id} Hash]
  ├─ Selections (per participant)  [session:{code}:{participantId}:selections Set]
  └─ Results (1)  [session:{code}:results Set]

Static Dinner Options (application-level, not in Redis)
```

---

## Redis Key Schema

### Key Naming Convention
`{namespace}:{entity}:{id}[:subentity][:subid][:attribute]`

### All Keys for Session ABC123 with 3 Participants

```
session:ABC123                                 [Hash]    Session metadata
session:ABC123:participants                    [Set]     Participant IDs
session:ABC123:socket-uuid-1:selections        [Set]     Alice's selections
session:ABC123:socket-uuid-2:selections        [Set]     Bob's selections
session:ABC123:socket-uuid-3:selections        [Set]     Charlie's selections
session:ABC123:results                         [Set]     Overlapping options
participant:socket-uuid-1                      [Hash]    Alice's metadata (optional)
participant:socket-uuid-2                      [Hash]    Bob's metadata (optional)
participant:socket-uuid-3                      [Hash]    Charlie's metadata (optional)
```

**All keys share the same EXPIREAT timestamp for atomic expiration.**

---

## TTL Management Strategy

### Heartbeat-Based Refresh

On every user activity (join, selection, submit, view results):

1. Calculate new expiration: `currentTime + 1800 seconds` (30 minutes)
2. Execute Lua script to atomically refresh all session keys:

```lua
-- refresh_session_ttl.lua
local expireAt = tonumber(ARGV[1])
for i = 1, #KEYS do
    redis.call('EXPIREAT', KEYS[i], expireAt)
end
return expireAt
```

3. Update `lastActivityAt` in session Hash

**Benefits**:
- Prevents premature expiration during active sessions
- Atomic refresh ensures no staggered expiration
- Leverages Redis native TTL (no manual cleanup)

---

## Memory Estimation

### Per Session (4 participants, 15 selections each):

| Data Structure | Size | Encoding | Memory |
|----------------|------|----------|---------|
| Session Hash | 5 fields | ziplist | ~200 bytes |
| Participants Set | 4 UUIDs | intset | ~150 bytes |
| Selections Sets (4×) | 15 optionIds | intset | ~600 bytes |
| Results Set | ~5 optionIds | intset | ~100 bytes |
| Participant Hashes (4×) | 4 fields each | ziplist | ~400 bytes |
| **Total per session** | | | **~1.5 KB** |

### For 50 Concurrent Sessions:
- **50 sessions × 1.5 KB = 75 KB**
- **With overhead: ~150 KB total**

This is trivial for Redis (handles millions of keys and hundreds of thousands of ops/sec).

---

## Data Access Patterns

### Create Session
```bash
HSET session:ABC123 createdAt 1709251200 hostId "socket-uuid-1" state "waiting" participantCount 1 lastActivityAt 1709251200
SADD session:ABC123:participants "socket-uuid-1"
EXPIREAT session:ABC123 1709252800
EXPIREAT session:ABC123:participants 1709252800
```

### Join Session
```bash
# Check participant limit
SCARD session:ABC123:participants  # Must be < 4

# Add participant
SADD session:ABC123:participants "socket-uuid-2"
HINCRBY session:ABC123 participantCount 1
HSET session:ABC123 lastActivityAt 1709251800

# Refresh TTL
EXPIREAT session:ABC123 1709253600
EXPIREAT session:ABC123:participants 1709253600
```

### Submit Selections
```bash
# Store selections
SADD session:ABC123:socket-uuid-1:selections "pizza-palace" "sushi-spot" "thai-kitchen"
EXPIREAT session:ABC123:socket-uuid-1:selections 1709253600

# Update session
HSET session:ABC123 lastActivityAt 1709251900
```

### Calculate Overlap (when all submitted)
```bash
# Get all participant IDs
SMEMBERS session:ABC123:participants
# Returns: ["socket-uuid-1", "socket-uuid-2", "socket-uuid-3"]

# Calculate intersection
SINTER \
  session:ABC123:socket-uuid-1:selections \
  session:ABC123:socket-uuid-2:selections \
  session:ABC123:socket-uuid-3:selections

# Store result
SADD session:ABC123:results "sushi-spot" "thai-kitchen"
EXPIREAT session:ABC123:results 1709253600

# Update session state
HSET session:ABC123 state "complete"
```

### Restart Session (FR-012)
```bash
# Clear previous selections and results
DEL session:ABC123:socket-uuid-1:selections
DEL session:ABC123:socket-uuid-2:selections
DEL session:ABC123:socket-uuid-3:selections
DEL session:ABC123:results

# Reset session state
HSET session:ABC123 state "selecting" lastActivityAt 1709252000

# Refresh TTL
EXPIREAT session:ABC123 1709253800
```

### Cleanup on Disconnect
```bash
# Remove participant
SREM session:ABC123:participants "socket-uuid-2"
HINCRBY session:ABC123 participantCount -1
DEL session:ABC123:socket-uuid-2:selections
DEL participant:socket-uuid-2

# If no participants remain
SCARD session:ABC123:participants  # Returns 0
# → Delete entire session
DEL session:ABC123
DEL session:ABC123:participants
DEL session:ABC123:results
# (Remaining keys will auto-expire via TTL)
```

---

## Validation Rules Summary

| Entity | Field | Rule | Enforcement |
|--------|-------|------|-------------|
| Session | sessionCode | 6 chars, alphanumeric, uppercase | Backend generation |
| Session | participantCount | 1-4 | SCARD check before SADD |
| Session | state | Enum: waiting, selecting, complete, expired | Backend state machine |
| Participant | displayName | 1-50 chars | Backend validation (Zod schema) |
| Participant | count per session | Max 4 | SCARD check (FR-005) |
| Selection | optionIds | Must exist in static list | Backend validation |
| Selection | count | ≥1 option | Backend validation at submit |
| Result | overlap | Calculated, not user-provided | Redis SINTER |

---

## TypeScript Models (Shared Types)

```typescript
// shared/types/models.ts

export interface Session {
  sessionCode: string;
  hostId: string;
  state: 'waiting' | 'selecting' | 'complete' | 'expired';
  participantCount: number;
  createdAt: number;
  lastActivityAt: number;
}

export interface Participant {
  participantId: string;
  displayName: string;
  sessionCode: string;
  joinedAt: number;
  hasSubmitted: boolean;
  isHost: boolean;
}

export interface DinnerOption {
  optionId: string;
  displayName: string;
  description?: string;
}

export interface Selection {
  participantId: string;
  sessionCode: string;
  optionIds: string[];
}

export interface Result {
  sessionCode: string;
  overlappingOptions: DinnerOption[];
  allSelections: Record<string, string[]>;  // participantName -> optionIds
}
```

---

## Related Documents

- [Feature Specification](./spec.md) - Functional requirements
- [Research](./research.md) - Redis TTL and data structure decisions
- [API Contracts](./contracts/) - OpenAPI and WebSocket event schemas