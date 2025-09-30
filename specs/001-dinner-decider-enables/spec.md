# Feature Specification: Dinner Decider

**Feature Branch**: `001-dinner-decider-enables`
**Created**: 2025-09-30
**Status**: Draft
**Input**: User description: "Dinner Decider enables 1–4 people to join a shared session (via short code or link), view the same curated list of dinner options, privately select the items they'd be happy with, and then reveals only the overlapping choices for the group to choose from. The experience optimizes for speed and fairness: no accounts required initially, mobile-first UI, and minimal steps to decision. If there's no overlap, the group can choose to rerun with same inputs, but no automated fallback is provided."

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation
When creating this spec from a user prompt:
1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## Clarifications

### Session 2025-09-30
- Q: What is the source of the dinner options list presented to participants? → A: Static hardcoded list (same options for all sessions everywhere)
- Q: How long should a session remain active before automatically expiring? → A: 30 minutes from last activity
- Q: If only the session creator joins (no one else), can they submit selections and view results? → A: Yes, allow 1-person sessions (they see their own selections as results)
- Q: Do participants see when others join or submit their selections, or is all activity hidden until results? → A: Show names/count when joining, hide during selection phase
- Q: How should the system prevent the same person from joining multiple times or impersonating others? → A: No prevention - honor system (simplest, fits "no accounts" philosophy)
- Q: How should the system handle a participant who joins but never submits (or disconnects) during a session? → A: Block results until they submit or the session expires
- Q: Can participants update their selection after they've pressed submit while the session is still waiting on others? → A: No; once a participant submits, their choices are locked until the session restarts
- Q: If a participant closes their browser or app after submitting but before results appear, should the system treat them as still present or remove them? → A: Session stays in waiting state until they reconnect or session expires (30 minutes). Automatic removal deferred for MVP.

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
A group of 1-4 friends wants to decide where to eat dinner together. One person initiates a session and shares a short code or link with the others (or proceeds alone if no one else joins). Each person independently views the same list of dinner options and privately selects which ones they'd be happy with. Once everyone has submitted their choices, the system reveals only the options that everyone selected, creating an instant consensus. If only one person participates, they see their own selections as results. The group can then choose from these overlapping options or restart if there's no match.

### Acceptance Scenarios
1. **Given** a user wants to start a dinner decision session, **When** they initiate a new session, **Then** they receive a unique short code or shareable link that others can use to join
2. **Given** a user has a session code or link, **When** they join the session with a display name, **Then** they see the same curated list of dinner options as all other participants and their name is visible to existing participants
3. **Given** a user is viewing dinner options in a session, **When** they select their preferred options, **Then** their selections remain private from other participants until all have submitted
4. **Given** all participants (2-4 people) have submitted their selections, **When** the system processes the choices, **Then** it reveals only the dinner options that all participants selected
5. **Given** participants have viewed the results, **When** there are overlapping choices, **Then** the group can see these options and make a final decision
6. **Given** participants have viewed the results, **When** there are no overlapping choices, **Then** the group can choose to restart the selection process with the same dinner options

### Edge Cases
- A single participant immediately sees their own submitted selections as the final result set.
- The system rejects join attempts beyond the 4 participant maximum and informs the requester the session is full.
- If a participant joins but never submits, the session remains in a waiting state with results hidden until they submit or the session expires.
- If the session creator leaves before results, their absence is treated like any other missing submission—the session stays pending until they return or expire.
- When a session reaches the 30-minute inactivity timeout while participants are selecting, it expires and discards all data; participants must start a new session.
- Participants cannot change selections after submitting; any updates require restarting the session.
- Simultaneous session creation from the same device should succeed independently, each generating its own code.
- Network interruptions are treated as temporary disconnects; participants must reconnect and resubmit before results appear.
- The static dinner options list must not contain duplicate optionIds (validated at application startup).

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST allow a user to create a new dinner decision session without requiring account creation or login
- **FR-002**: System MUST generate a unique short code for each session that can be shared with other participants
- **FR-003**: System MUST provide a shareable link for each session as an alternative to the short code
- **FR-004**: System MUST allow 1-4 people total (including the creator) to join a session
- **FR-005**: System MUST prevent more than 4 people from joining a single session
- **FR-006**: System MUST present the same curated list of dinner options to all participants in a session
- **FR-007**: System MUST allow each participant to select multiple dinner options from the curated list
- **FR-008**: System MUST keep each participant's selections private from other participants until all have submitted
- **FR-009**: System MUST track when all participants have submitted their selections
- **FR-010**: System MUST calculate and reveal only the dinner options that all participants selected (the intersection of choices)
- **FR-011**: System MUST display the overlapping choices to all participants once all selections are submitted
- **FR-012**: System MUST allow the group to restart the selection process if there are no overlapping choices
- **FR-013**: System MUST preserve the same dinner options list when restarting a session
- **FR-014**: System MUST provide a mobile-first user interface optimized for phone and tablet screens
- **FR-015**: System MUST minimize the number of steps required from session creation to viewing results
- **FR-016**: System MUST NOT provide automated fallback options when there is no overlap
- **FR-017**: System MUST allow participants to join a session using either a short code or a link

- **FR-018**: System MUST provide a static hardcoded list of dinner options that is the same for all sessions and all users

- **FR-019**: System MUST automatically expire sessions after 30 minutes of inactivity (no joins, selections, or submissions)
- **FR-020**: System MUST delete all session data (participants, selections, results) after expiration

- **FR-021**: System MUST allow a single participant to complete a session and view their selections as results (no overlap calculation needed)

- **FR-022**: System MUST display participant names and count in real-time when users join the session
- **FR-023**: System MUST hide all participant activity (submission status, selections) during the selection phase until all have submitted

- **FR-024**: System MUST NOT implement technical measures to prevent duplicate joins or impersonation (honor system approach, no accounts or device tracking required)

- **FR-025**: System MUST keep results hidden until all participants submit; if a participant disconnects or never submits, the session stays in waiting state until they return or the session expires due to inactivity
- **FR-026**: System MUST lock a participant's selections immediately after they submit; changes require restarting the session

### Key Entities *(include if feature involves data)*
- **Session**: Represents a dinner decision session, contains a unique identifier (short code), a shareable link, participant count (1-4), session status (waiting, selecting, completed, expired), last activity timestamp for expiration tracking (30 minute timeout), and the curated list of dinner options presented to participants
- **Participant**: Represents an individual in a session, contains a display name (visible to others when joining), tracks their selection status (pending/submitted - hidden from others during selection), their private selections, and their unique identifier within the session
- **Dinner Option**: Represents a single restaurant or dining choice from the static hardcoded list, contains display information (name, description) visible to all participants
- **Selection**: Represents a participant's chosen dinner options, remains private until all participants submit, then used to calculate intersection
- **Result**: Represents the overlapping choices calculated from all participants' selections, displayed to all participants after everyone has submitted

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous (except marked items)
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed (pending clarifications)

---