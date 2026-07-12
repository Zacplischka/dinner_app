# Graph Report - .  (2026-07-12)

## Corpus Check
- 208 files · ~472,567 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1158 nodes · 1848 edges · 90 communities (70 shown, 20 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.83)
- Token cost: 499,352 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Demo Guide Data|Demo Guide Data]]
- [[_COMMUNITY_UI States & Transitions|UI States & Transitions]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Shared API Types|Shared API Types]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_App Shell & Toasts|App Shell & Toasts]]
- [[_COMMUNITY_E2E Test Fixtures|E2E Test Fixtures]]
- [[_COMMUNITY_Backend TS Config|Backend TS Config]]
- [[_COMMUNITY_Auth UI & Navigation|Auth UI & Navigation]]
- [[_COMMUNITY_Friends UI|Friends UI]]
- [[_COMMUNITY_Root Package Config|Root Package Config]]
- [[_COMMUNITY_Selection Service & Redis|Selection Service & Redis]]
- [[_COMMUNITY_Session Model|Session Model]]
- [[_COMMUNITY_API Contract Tests|API Contract Tests]]
- [[_COMMUNITY_Frontend TS Config|Frontend TS Config]]
- [[_COMMUNITY_Frontend Lint Config|Frontend Lint Config]]
- [[_COMMUNITY_Shared Package Config|Shared Package Config]]
- [[_COMMUNITY_Discovery Card Components|Discovery Card Components]]
- [[_COMMUNITY_Scroll & Curated Lists|Scroll & Curated Lists]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Shared TS Config|Shared TS Config]]
- [[_COMMUNITY_E2E Page Objects Base|E2E Page Objects Base]]
- [[_COMMUNITY_Selection Page Object|Selection Page Object]]
- [[_COMMUNITY_Session TTL Service|Session TTL Service]]
- [[_COMMUNITY_Zod Schemas|Zod Schemas]]
- [[_COMMUNITY_Backend Lint Config|Backend Lint Config]]
- [[_COMMUNITY_Server & Expiry Notifier|Server & Expiry Notifier]]
- [[_COMMUNITY_Redis Data Model Spec|Redis Data Model Spec]]
- [[_COMMUNITY_Backend Supabase Service|Backend Supabase Service]]
- [[_COMMUNITY_Touch Interactions|Touch Interactions]]
- [[_COMMUNITY_Google Places Search|Google Places Search]]
- [[_COMMUNITY_Join Page Object|Join Page Object]]
- [[_COMMUNITY_Results Page Object|Results Page Object]]
- [[_COMMUNITY_Lobby Page Object|Lobby Page Object]]
- [[_COMMUNITY_Restaurant Detail & Page Tests|Restaurant Detail & Page Tests]]
- [[_COMMUNITY_Friends API & Auth Metadata|Friends API & Auth Metadata]]
- [[_COMMUNITY_Swipe Card|Swipe Card]]
- [[_COMMUNITY_Create Page Object|Create Page Object]]
- [[_COMMUNITY_WebSocket Integration Tests|WebSocket Integration Tests]]
- [[_COMMUNITY_Demo Walkthrough GIF|Demo Walkthrough GIF]]
- [[_COMMUNITY_Results Screen|Results Screen]]
- [[_COMMUNITY_Socket Service Tests|Socket Service Tests]]
- [[_COMMUNITY_Spec Documents|Spec Documents]]
- [[_COMMUNITY_Sessions REST API|Sessions REST API]]
- [[_COMMUNITY_Railway Deploy Config|Railway Deploy Config]]
- [[_COMMUNITY_Home Page Object|Home Page Object]]
- [[_COMMUNITY_Socket Auth|Socket Auth]]
- [[_COMMUNITY_Participant Model|Participant Model]]
- [[_COMMUNITY_Home Screen|Home Screen]]
- [[_COMMUNITY_Lobby Screen|Lobby Screen]]
- [[_COMMUNITY_Selection Screen|Selection Screen]]
- [[_COMMUNITY_OpenAPI Contract|OpenAPI Contract]]
- [[_COMMUNITY_Overlap Calculation|Overlap Calculation]]
- [[_COMMUNITY_Frontend Supabase Auth|Frontend Supabase Auth]]
- [[_COMMUNITY_Vite TS Config|Vite TS Config]]
- [[_COMMUNITY_Selection Model|Selection Model]]
- [[_COMMUNITY_Create Screen|Create Screen]]
- [[_COMMUNITY_Join Screen|Join Screen]]
- [[_COMMUNITY_Logo Generator Script|Logo Generator Script]]
- [[_COMMUNITY_WebSocket Event Contracts|WebSocket Event Contracts]]
- [[_COMMUNITY_CICD Pipeline|CI/CD Pipeline]]
- [[_COMMUNITY_User Flows & Seed Data|User Flows & Seed Data]]
- [[_COMMUNITY_Friends Store Tests|Friends Store Tests]]
- [[_COMMUNITY_Progress Stepper|Progress Stepper]]
- [[_COMMUNITY_Friends Contract Tests|Friends Contract Tests]]
- [[_COMMUNITY_Demo Images|Demo Images]]
- [[_COMMUNITY_Expiry Notifier Tests|Expiry Notifier Tests]]
- [[_COMMUNITY_Agent Instructions|Agent Instructions]]
- [[_COMMUNITY_Action Sheet|Action Sheet]]
- [[_COMMUNITY_Leave Confirmation Modal|Leave Confirmation Modal]]
- [[_COMMUNITY_Floating Nav|Floating Nav]]
- [[_COMMUNITY_E2E Test Docs|E2E Test Docs]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_Unit Test Setup|Unit Test Setup]]
- [[_COMMUNITY_App Icon|App Icon]]
- [[_COMMUNITY_Brand Logo|Brand Logo]]
- [[_COMMUNITY_Favicon|Favicon]]
- [[_COMMUNITY_Start Script|Start Script]]
- [[_COMMUNITY_Railpack SPA Config|Railpack SPA Config]]

## God Nodes (most connected - your core abstractions)
1. `useAuthStore` - 34 edges
2. `useFriendsStore` - 31 edges
3. `useSessionStore` - 31 edges
4. `BasePage` - 25 edges
5. `compilerOptions` - 24 edges
6. `redis` - 23 edges
7. `compilerOptions` - 18 edges
8. `SelectionPage` - 17 edges
9. `scripts` - 15 edges
10. `compilerOptions` - 15 edges

## Surprising Connections (you probably didn't know these)
- `AGENTS.md Codex Context` --semantically_similar_to--> `CLAUDE.md Project Context`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `Set-Intersection Consensus (SINTER)` --semantically_similar_to--> `SINTER Overlap Calculation`  [INFERRED] [semantically similar]
  README.md → specs/001-dinner-decider-enables/data-model.md
- `E2E Test Documentation` --references--> `CI/CD Pipeline Workflow`  [INFERRED]
  frontend/tests/e2e/TEST_DOCUMENTATION.md → .github/workflows/ci-cd.yml
- `Verify Production Deploy Job` --conceptually_related_to--> `Railway Deployment Guide`  [INFERRED]
  .github/workflows/ci-cd.yml → DEPLOY_GUIDE.md
- `CLAUDE.md Project Context` --references--> `WebSocket Events Contract`  [EXTRACTED]
  CLAUDE.md → specs/001-dinner-decider-enables/contracts/websocket-events.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI/CD Pipeline Job Chain** — workflows_ci_cd_lint_job, workflows_ci_cd_contract_tests_job, workflows_ci_cd_e2e_tests_job, workflows_ci_cd_verify_production_deploy [EXTRACTED 1.00]
- **Spec-Kit Design Artifact Flow (spec -> research -> plan -> data-model/contracts -> quickstart -> tasks)** — 001_dinner_decider_enables_spec_document, 001_dinner_decider_enables_research_document, 001_dinner_decider_enables_plan_document, 001_dinner_decider_enables_data_model_document, contracts_openapi_document, contracts_websocket_events_document, 001_dinner_decider_enables_quickstart_document, 001_dinner_decider_enables_tasks_document [EXTRACTED 1.00]
- **Ephemeral Redis Session Pattern (keys + atomic TTL + SINTER + push expiry)** — 001_dinner_decider_enables_data_model_redis_key_schema, 001_dinner_decider_enables_data_model_ttl_refresh_lua, 001_dinner_decider_enables_data_model_sinter_overlap, readme_push_expiry [INFERRED 0.85]

## Communities (90 total, 20 thin omitted)

### Community 0 - "Demo Guide Data"
Cohesion: 0.05
Nodes (60): NavigationHeader(), NavigationHeaderProps, getGuideList(), getGuideRestaurant(), getRestaurantsForList(), GUIDE_LISTS, GUIDE_RESTAURANTS, GuideList (+52 more)

### Community 1 - "UI States & Transitions"
Cohesion: 0.06
Nodes (41): EmptyStateProps, NoMatchesEmpty(), NoParticipantsEmpty(), NoRestaurantsEmpty(), NoResultsEmpty(), AnimatedRoute(), AnimatedRouteProps, PageTransition() (+33 more)

### Community 2 - "Frontend Dependencies"
Cohesion: 0.04
Nodes (48): author, dependencies, @dinder/shared, react, react-dom, react-router-dom, socket.io-client, @supabase/supabase-js (+40 more)

### Community 3 - "Shared API Types"
Cohesion: 0.04
Nodes (44): CreateSessionRequest, DinnerOptionsResponse, ErrorResponse, JoinSessionRequest, JoinSessionResponse, RestaurantsResponse, SessionResponse, AcceptFriendRequestPayload (+36 more)

### Community 4 - "Backend Dependencies"
Cohesion: 0.04
Nodes (44): author, dependencies, cors, @dinder/shared, dotenv, express, ioredis, jsonwebtoken (+36 more)

### Community 5 - "App Shell & Toasts"
Cohesion: 0.07
Nodes (26): DEFAULT_DURATIONS, Toast, ToastOptions, ToastStore, ToastType, useToastStore, App(), CreateSessionPage (+18 more)

### Community 6 - "E2E Test Fixtures"
Cohesion: 0.09
Nodes (12): MultiParticipantFixture, multiParticipantTest, Participant, PageObjects, test, TestHelpers, checkAccessibility(), expectFastPageLoad() (+4 more)

### Community 7 - "Backend TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module (+18 more)

### Community 8 - "Auth UI & Navigation"
Cohesion: 0.16
Nodes (18): GoogleSignInButton(), GoogleSignInButtonProps, GoogleSignInButton(), TopNav(), TopNavProps, UserProfileButton(), UserMenu(), HomePage() (+10 more)

### Community 9 - "Friends UI"
Cohesion: 0.15
Nodes (17): AddFriendModal(), AddFriendModalProps, FriendRequestCard(), FriendRequestCardProps, FriendsList(), FriendsListProps, InviteFriendsSection(), InviteFriendsSectionProps (+9 more)

### Community 10 - "Root Package Config"
Cohesion: 0.08
Nodes (24): author, description, devDependencies, canvas, jsdom, @vitest/coverage-v8, wait-on, keywords (+16 more)

### Community 11 - "Selection Service & Redis"
Cohesion: 0.16
Nodes (5): disconnectRedis(), pingRedis(), redis, REDIS_PORT, sessionRestartPayloadSchema

### Community 12 - "Session Model"
Cohesion: 0.12
Nodes (6): emitError(), ErrorCodes, handleSessionLeave(), sessionLeavePayloadSchema, handleSelectionSubmit(), selectionSubmitPayloadSchema

### Community 13 - "API Contract Tests"
Cohesion: 0.28
Nodes (6): createSessionRecord(), createSessionRestaurants(), cleanupTestData(), getTestRedis(), waitForRedis(), app

### Community 14 - "Frontend TS Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+12 more)

### Community 15 - "Frontend Lint Config"
Cohesion: 0.10
Nodes (19): jsx, env, browser, es2020, extends, parser, parserOptions, ecmaFeatures (+11 more)

### Community 16 - "Shared Package Config"
Cohesion: 0.10
Nodes (19): author, dependencies, zod, description, devDependencies, typescript, exports, ./schemas (+11 more)

### Community 17 - "Discovery Card Components"
Cohesion: 0.12
Nodes (16): AnimatedSection(), AnimatedSectionProps, COLLECTION_IMAGES, CollectionCard(), CollectionCardProps, CUISINE_IMAGES, CuisineCard(), CuisineCardProps (+8 more)

### Community 18 - "Scroll & Curated Lists"
Cohesion: 0.12
Nodes (13): BackToTop(), BackToTopProps, ReadingTime(), ReadingTimeProps, ScrollProgressProps, SectionProgress(), SectionProgressProps, CURATED_LISTS (+5 more)

### Community 19 - "Auth Middleware"
Cohesion: 0.18
Nodes (12): getErrorMessage(), getFailureReason(), isSupabaseAuthConfigured(), mapSupabaseUser(), optionalAuth(), requireAuth(), SupabaseAuthUser, TokenVerificationFailure (+4 more)

### Community 20 - "Shared TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 23 - "Session TTL Service"
Cohesion: 0.23
Nodes (12): calculateExpireAt(), __dirname, __filename, getExpiresAtISO(), refreshSessionTtl(), refreshTtlScript, createSession(), generateSessionCode() (+4 more)

### Community 24 - "Zod Schemas"
Cohesion: 0.12
Nodes (13): createSessionRequestSchema, dinnerOptionSchema, dinnerOptionsResponseSchema, errorResponseSchema, joinSessionRequestSchema, joinSessionResponseSchema, sessionResponseSchema, errorEventSchema (+5 more)

### Community 25 - "Backend Lint Config"
Cohesion: 0.13
Nodes (14): env, es2022, node, extends, parser, parserOptions, ecmaVersion, project (+6 more)

### Community 26 - "Server & Expiry Notifier"
Cohesion: 0.18
Nodes (11): restartSession(), disconnectSessionExpiryNotifier(), initializeSessionExpiryNotifier(), REDIS_PORT, allowedOrigins, io, PORT, startServer() (+3 more)

### Community 27 - "Redis Data Model Spec"
Cohesion: 0.15
Nodes (14): Redis Key Schema for Sessions, SINTER Overlap Calculation, Atomic TTL Refresh Lua Script, Participant Entity, Result Entity (Overlap), Selection Entity, Session Entity, session:results Broadcast (+6 more)

### Community 28 - "Backend Supabase Service"
Cohesion: 0.19
Nodes (10): supabase, config, validateConfig(), Database, Friendship, FriendshipInsert, FriendWithProfile, ProfileInsert (+2 more)

### Community 29 - "Touch Interactions"
Cohesion: 0.19
Nodes (12): PullToRefresh(), PullToRefreshProps, RefreshIndicator(), RefreshIndicatorProps, HAPTIC_PATTERNS, HapticType, RippleButton(), RippleButtonProps (+4 more)

### Community 30 - "Google Places Search"
Cohesion: 0.20
Nodes (12): BLOCKED_PLACE_TYPES, deduplicateRestaurants(), fetchTextSearchPage(), FOOD_PLACE_TYPES, getPhotoUrl(), GooglePlacePhoto, GooglePlaceResult, GooglePlacesSearchParams (+4 more)

### Community 34 - "Restaurant Detail & Page Tests"
Cohesion: 0.17
Nodes (8): RESTAURANTS, friend, guideMocks, invite, participant, profile, request, serviceMocks

### Community 35 - "Friends API & Auth Metadata"
Cohesion: 0.25
Nodes (7): AuthProfileDefaults, getAuthProfileDefaults(), getEmailName(), getMetadataString(), router, AuthenticatedRequest, Profile

### Community 36 - "Swipe Card"
Cohesion: 0.20
Nodes (7): SwipeCard(), SwipeCardProps, authActions, friend, invite, restaurant, TestIntersectionObserver

### Community 38 - "WebSocket Integration Tests"
Cohesion: 0.29
Nodes (5): startSocketServer(), stopSocketServer(), MOCK_RESTAURANTS, PLACE_IDS, httpServer

### Community 39 - "Demo Walkthrough GIF"
Cohesion: 0.27
Nodes (10): Dinder Demo GIF, Create Session Screen (02/06 Create), Home Screen (01/06 Dinder), Join Session Screen (03/06 Share), Lobby Screen (04/06 Lobby), Match Results Screen (06/06 Match), Real-Time Participant Updates, Redis SINTER Overlap Calculation (+2 more)

### Community 40 - "Results Screen"
Cohesion: 0.24
Nodes (10): Results Screen Screenshot, Uber Eats and DoorDash Deep Links, Everyone's Selections Section, Matching Restaurants List, Mobile-First Dark Theme UI, Selection Overlap Calculation, Perfect Match Header, Restaurant Result Card (+2 more)

### Community 41 - "Socket Service Tests"
Cohesion: 0.22
Nodes (4): FakeSocket, Handler, participant, socketMocks

### Community 42 - "Spec Documents"
Cohesion: 0.42
Nodes (9): Data Model: Dinner Decider, Implementation Plan: Dinner Decider, Quickstart Guide: Dinner Decider, Research: Dinner Decider Implementation, WCAG 2.2 AA Mobile Accessibility Decision, Zustand State Management Decision, Dinner Decider Feature Specification, Tasks: Dinner Decider (78 tasks) (+1 more)

### Community 43 - "Sessions REST API"
Cohesion: 0.28
Nodes (5): asyncHandler(), AsyncRequestHandler, createSessionRequestSchema, joinSessionRequestSchema, router

### Community 44 - "Railway Deploy Config"
Cohesion: 0.22
Nodes (8): build, buildCommand, builder, deploy, restartPolicyMaxRetries, restartPolicyType, startCommand, $schema

### Community 46 - "Socket Auth"
Cohesion: 0.33
Nodes (7): AuthenticatedUser, DinderSocket, getSocketAuthToken(), getSocketUser(), setSocketUser(), SocketData, SocketWithData

### Community 48 - "Home Screen"
Cohesion: 0.25
Nodes (9): Home Screen Screenshot, Create Session Button, Dinder Landing Screen, Up to 4 Participants Limit, Continue with Google Sign-In, Guest Mode, Join Session Button, Mobile-First Dark Theme Design (+1 more)

### Community 49 - "Lobby Screen"
Cohesion: 0.33
Nodes (9): Lobby Screenshot (Make the Call), Copy Shareable Link Button, Dark-Themed Mobile-First UI, Participant List (2/4 with Host Badge), Online Presence Indicators (Green Dots), Session Code Display, 30-Minute Session Expiry Notice, Start Selecting CTA Button (+1 more)

### Community 50 - "Selection Screen"
Cohesion: 0.33
Nodes (9): Selection Screen Screenshot, Reject / Undo / Like Action Buttons, Dark-Themed Mobile-First UI, Like Counter with Presence Dot, Selection Progress Indicator (1/20), Restaurant Card, Restaurant Metadata (Rating, Category, Address), Session Code Badge (4QA77W) (+1 more)

### Community 51 - "OpenAPI Contract"
Cohesion: 0.25
Nodes (8): Contract-First API Testing Decision, Dinner Option Entity, Honor System (No Auth), POST /sessions (createSession), Dinner Decider OpenAPI REST Contract, GET /options (getDinnerOptions), GET /sessions/{code} (getSession), POST /sessions/{code}/join (joinSession)

### Community 52 - "Overlap Calculation"
Cohesion: 0.39
Nodes (3): router, parseRedisJson(), calculateOverlap()

### Community 53 - "Frontend Supabase Auth"
Cohesion: 0.36
Nodes (6): supabase, getCurrentUser(), getSession(), signInWithGoogle(), signOut(), supabaseMocks

### Community 54 - "Vite TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 55 - "Selection Model"
Cohesion: 0.32
Nodes (4): getAllSelections(), getSelections(), getSubmittedCount(), hasSubmitted()

### Community 56 - "Create Screen"
Cohesion: 0.33
Nodes (7): Create Session Screenshot, Create Session Screen, Location Capture (Geolocation Coordinates), Mobile-First Dark Theme UI, Participant Name Input (50 char limit), Search Radius Slider (1-15 miles), Session Code Sharing

### Community 57 - "Join Screen"
Cohesion: 0.33
Nodes (7): Join Page (Frontend), Join Session Button, Join Session Screen Screenshot, Mobile-First Dark Themed UI, Participant Name Input, Session Code Input, 6-Character Alphanumeric Session Code

### Community 58 - "Logo Generator Script"
Cohesion: 0.29
Nodes (5): { createCanvas, registerFont }, fontPath, fs, path, publicDir

### Community 59 - "WebSocket Event Contracts"
Cohesion: 0.40
Nodes (6): Connection State Recovery Decision, Socket.IO Room-Based Architecture Decision, WebSocket Events Contract, participant:joined Broadcast, selection:submit Event, session:join Event

### Community 60 - "CI/CD Pipeline"
Cohesion: 0.33
Nodes (6): Railway Deployment Guide, Playwright HTML Test Report (generated), Contract Tests Job, E2E Smoke Tests Job, Lint and Type Check Job, Verify Production Deploy Job

### Community 61 - "User Flows & Seed Data"
Cohesion: 0.33
Nodes (6): Melbourne East-Side Restaurant Seed (100), Discovery Flow, Dinder User Flows & Navigation, FloatingNav Mobile Component, Kinetic Warmth Design Philosophy, Frontend HTML App Shell

### Community 62 - "Friends Store Tests"
Cohesion: 0.33
Nodes (4): friend, invite, profile, request

### Community 63 - "Progress Stepper"
Cohesion: 0.40
Nodes (3): ProgressStepperProps, Step, STEPS

### Community 65 - "Demo Images"
Cohesion: 0.60
Nodes (3): demoPhotoUrl(), encode(), pick()

### Community 67 - "Agent Instructions"
Cohesion: 0.50
Nodes (4): AGENTS.md Codex Context, CLAUDE.md Project Context, Claude Code Review Workflow, Claude Code @claude Mention Workflow

### Community 71 - "E2E Test Docs"
Cohesion: 0.67
Nodes (3): E2E Test Documentation, Page Object Model Test Architecture, CI/CD Pipeline Workflow

## Knowledge Gaps
- **481 isolated node(s):** `parser`, `ecmaVersion`, `sourceType`, `project`, `plugins` (+476 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BasePage` connect `E2E Page Objects Base` to `Results Page Object`, `Lobby Page Object`, `Create Page Object`, `E2E Test Fixtures`, `Home Page Object`, `Selection Page Object`, `Join Page Object`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `useAuthStore` connect `Auth UI & Navigation` to `Demo Guide Data`, `UI States & Transitions`, `Restaurant Detail & Page Tests`, `Swipe Card`, `App Shell & Toasts`, `Friends UI`, `Socket Service Tests`, `Scroll & Curated Lists`, `Friends Store Tests`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `useSessionStore` connect `Demo Guide Data` to `UI States & Transitions`, `Restaurant Detail & Page Tests`, `Swipe Card`, `App Shell & Toasts`, `Socket Service Tests`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useFriendsStore` (e.g. with `CreateSessionPage()` and `HomePage()`) actually correct?**
  _`useFriendsStore` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `useSessionStore` (e.g. with `CreateSessionPage()` and `JoinSessionPage()`) actually correct?**
  _`useSessionStore` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `parser`, `ecmaVersion`, `sourceType` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Demo Guide Data` be split into smaller, more focused modules?**
  _Cohesion score 0.053235653235653234 - nodes in this community are weakly interconnected._