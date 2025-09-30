<!--
SYNC IMPACT REPORT (2025-09-30)
═══════════════════════════════════════════════════════════════════
Version Change: Initial → 1.0.0
Modified Principles: N/A (initial constitution)
Added Sections: All core principles, Performance & Scale, Mobile-First Design, Governance
Removed Sections: N/A

Templates Status:
✅ plan-template.md - References constitution check (aligned)
✅ spec-template.md - Focuses on requirements (no updates needed)
✅ tasks-template.md - TDD-first ordering matches Principle III (aligned)
✅ agent-file-template.md - Context tracking (no conflicts)

Follow-up TODOs:
- None; all placeholders resolved
═══════════════════════════════════════════════════════════════════
-->

# Dinner Decider Constitution

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)
Tests MUST be written before implementation code. Every feature begins with failing tests that define expected behavior. The Red-Green-Refactor cycle is strictly enforced:
1. Write test(s) that fail
2. Implement minimum code to pass
3. Refactor while keeping tests green

**Rationale**: TDD prevents regression, documents behavior through executable specifications, and ensures every line of production code is justified by a test case.

### II. Contract-First API Design
All external interfaces (REST endpoints, WebSocket events, shared TypeScript types) MUST be defined and tested before implementation. Contract tests validate request/response schemas against published specifications (OpenAPI, TypeScript definitions).

**Rationale**: Contract-first design prevents breaking changes, enables parallel frontend/backend development, and provides executable documentation for API consumers.

### III. Real-Time State Synchronization
Session state MUST be synchronized across all participants in real-time using WebSocket connections. State changes (joins, selections, results) are broadcast only to authorized participants according to privacy rules (FR-023). Redis serves as the single source of truth for session state.

**Rationale**: Real-time updates are core to the user experience. Selective broadcasting prevents information leakage before all participants submit. Redis TTL ensures automatic cleanup without background workers.



### IV. Simplicity Over Features
Honor system for duplicate joins (FR-024) instead of device tracking or authentication. Static hardcoded options list (FR-018) instead of admin UI. No fallback algorithms when overlap fails (FR-016).

**Rationale**: Feature restraint keeps code maintainable. Complex solutions must justify their cost against simpler alternatives. YAGNI (You Aren't Gonna Need It) principle applies to all proposed enhancements.

## Performance & Scale

### Session Capacity
System MUST support 1-4 participants per session (FR-004, FR-005). Reject join attempts beyond 4 participants with clear error messages.

### Concurrency Targets
System MUST handle at least 50 concurrent active sessions (200 simultaneous connected clients) without performance degradation. Redis operations MUST use pipelining for multi-key updates.

### Latency Budgets
- REST API calls: <500ms p95 (includes Redis round-trip)
- WebSocket event broadcast: <200ms p95 (single room)
- Session expiration cleanup: handled by Redis TTL (no manual GC)

**Rationale**: Performance targets ensure snappy user experience. Conservative capacity limits simplify architecture. Redis native features eliminate custom expiration logic.

## Mobile-First Design

### Responsive Layout
All UI components MUST render correctly at 390px width (iPhone 12 Pro baseline). Touch targets MUST be at least 44x44px. Test viewport range: 320px to 768px.

### Progressive Enhancement
Core functionality (join, select, submit) MUST work without JavaScript frameworks client-side fallback. WebSocket disconnections MUST show clear reconnection UI.

### Accessibility
Color contrast MUST meet WCAG AA standards. Interactive elements MUST support keyboard navigation and screen readers.

**Rationale**: Mobile-first design ensures majority use case works well. Progressive enhancement degrades gracefully. Accessibility is a legal and ethical requirement.

## Governance

### Amendment Procedure
1. Propose principle change with rationale and impact analysis
2. Document affected templates, code, and tests
3. Update constitution with version bump (see Versioning Policy)
4. Migrate existing code/tests to comply
5. Update dependent templates in `.specify/templates/`

Any complexity additions (new libraries, patterns, infrastructure) MUST be justified in the Complexity Tracking section of plan.md with simpler alternatives considered.

### Runtime Guidance
This constitution informs `.specify/templates/` which generate feature-specific artifacts. Developers should consult `CLAUDE.md` (or agent-specific guidance files) in the repository root for context-aware development instructions.

**Version**: 1.0.0 | **Ratified**: 2025-09-30 | **Last Amended**: 2025-09-30