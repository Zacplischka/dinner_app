# E2E Test Documentation

## Overview

This document provides comprehensive documentation for all end-to-end (E2E) tests in the Dinner Decider application. These tests are written using Playwright and validate the user interface, navigation, form behavior, and accessibility features across the application.

## Test File: `home.spec.ts`

### Test Suite: Home Page

#### Test 1: `should display welcome screen with navigation options`
**Purpose**: Validates that the home page renders all essential UI elements correctly.

**What it tests**:
- The main heading "Dinner Decider" is visible on the page
- The tagline "Find restaurants everyone agrees on" is displayed
- "Create Session" button is present and visible
- "Join Session" button is present and visible
- All three informational bullet points are displayed:
  - "No sign-up required"
  - "Up to 4 participants"
  - "Private selections until everyone submits"

**Why it matters**: This is the entry point to the application. Users must see all options and understand the app's value proposition immediately upon landing.

**User flow**: User navigates to the home page (root URL).

---

#### Test 2: `should navigate to create session page`
**Purpose**: Verifies that clicking the "Create Session" button successfully navigates to the create session page.

**What it tests**:
- User can click the "Create Session" button
- After clicking, the browser URL changes to include `/create`
- Navigation occurs without errors

**Why it matters**: This is the primary action for users who want to host a dinner decision session. The navigation must work reliably.

**User flow**: User lands on home page → Clicks "Create Session" → Arrives at create session page.

---

#### Test 3: `should navigate to join session page`
**Purpose**: Verifies that clicking the "Join Session" button successfully navigates to the join session page.

**What it tests**:
- User can click the "Join Session" button
- After clicking, the browser URL changes to include `/join`
- Navigation occurs without errors

**Why it matters**: This is the primary action for users who want to participate in an existing session. The navigation must work reliably.

**User flow**: User lands on home page → Clicks "Join Session" → Arrives at join session page.

---

#### Test 4: `should have accessible button elements`
**Purpose**: Validates that interactive elements meet basic accessibility standards.

**What it tests**:
- Both "Create Session" and "Join Session" buttons are properly recognized as button elements (have correct ARIA roles)
- Both buttons are enabled and clickable
- Buttons can be found using accessible selectors (role-based queries)

**Why it matters**: Ensures the application is usable by assistive technologies like screen readers. This is critical for users with disabilities.

**User flow**: Automated accessibility check on page load.

---

#### Test 5: `should display mobile-friendly layout`
**Purpose**: Verifies that the home page renders correctly on mobile devices.

**What it tests**:
- Sets viewport to iPhone 12 Pro dimensions (390px × 844px)
- Verifies all critical UI elements are visible within mobile viewport:
  - Main heading
  - Both action buttons
- Ensures no elements are cut off or hidden on smaller screens

**Why it matters**: The application is mobile-first (per FR-014 requirement). Most users will access it on phones, so mobile layout must be flawless.

**User flow**: User accesses the app on a mobile device.

---

### Test Suite: Create Session Page

#### Test 6: `should display create session form`
**Purpose**: Validates that the create session page renders all necessary form elements.

**What it tests**:
- "Create Session" heading is visible
- "Your Name" input field is present and accessible
- "Create Session" submit button is visible
- "Cancel" button is visible

**Why it matters**: Users need all form elements to successfully create a session. Missing elements would block the core user flow.

**User flow**: User navigates to `/create` page.

---

#### Test 7: `should show character count for name input`
**Purpose**: Verifies that the character counter updates dynamically as users type.

**What it tests**:
- User can type into the "Your Name" field
- Character count displays and updates in real-time
- Format: "X/50 characters" (e.g., "4/50 characters" when 4 characters are entered)

**Why it matters**: Provides immediate feedback about input constraints (FR-020: 50 character limit). Helps users stay within limits without trial and error.

**User flow**: User types "John" into the name field → Sees "4/50 characters" indicator.

---

#### Test 8: `should disable submit button when name is empty`
**Purpose**: Validates that form validation prevents submission with empty required fields.

**What it tests**:
- On page load (when name field is empty), the "Create Session" button is disabled
- Disabled state prevents accidental submissions
- Visual feedback indicates the button cannot be clicked

**Why it matters**: Prevents invalid API calls and provides clear UX feedback about form requirements. Aligns with FR-020 validation requirements.

**User flow**: User arrives at create page → Sees disabled submit button → Understands they must enter a name.

---

#### Test 9: `should enable submit button when name is filled`
**Purpose**: Validates that the submit button becomes enabled when valid input is provided.

**What it tests**:
- User can type a name into the input field
- After entering text, the "Create Session" button becomes enabled
- Button transitions from disabled to enabled state

**Why it matters**: Confirms the form validation works bidirectionally - both preventing invalid submissions and allowing valid ones. Essential for completing the session creation flow.

**User flow**: User enters "John" → Submit button becomes clickable → User can proceed.

---

#### Test 10: `should navigate back on cancel`
**Purpose**: Verifies that users can exit the create session flow without creating a session.

**What it tests**:
- User can click the "Cancel" button
- After clicking, browser navigates back to home page (root URL)
- No session is created during this process

**Why it matters**: Provides an escape route if users change their mind. Essential for good UX - users should never feel trapped in a flow.

**User flow**: User is on create page → Clicks "Cancel" → Returns to home page.

---

### Test Suite: Join Session Page

#### Test 11: `should display join session form`
**Purpose**: Validates that the join session page renders all necessary form elements.

**What it tests**:
- "Join Session" heading is visible
- "Session Code" input field is present and accessible
- "Your Name" input field is present and accessible
- "Join Session" submit button is visible
- "Cancel" button is visible

**Why it matters**: Users need all form elements to successfully join a session. This is the primary participant entry point (FR-002, FR-003).

**User flow**: User navigates to `/join` page.

---

#### Test 12: `should format session code to uppercase`
**Purpose**: Verifies that session codes are automatically normalized to uppercase.

**What it tests**:
- User can type lowercase letters into the session code field
- Input is automatically converted to uppercase (e.g., "abc123" becomes "ABC123")
- Uppercase conversion happens in real-time as user types

**Why it matters**: Session codes are case-insensitive for better UX, but standardizing to uppercase prevents confusion and simplifies validation. Aligns with FR-020 session code format requirements.

**User flow**: User types "abc123" → Field displays "ABC123" → User sees consistent format.

---

#### Test 13: `should limit session code to 6 characters`
**Purpose**: Validates that session code input enforces the 6-character maximum.

**What it tests**:
- User attempts to type more than 6 characters
- Input field truncates at 6 characters (e.g., "ABCDEFGHIJ" becomes "ABCDEF")
- Additional characters beyond 6 are ignored

**Why it matters**: Session codes are exactly 6 alphanumeric characters (FR-020). Enforcing this limit prevents validation errors and improves UX by making requirements clear.

**User flow**: User types "ABCDEFGHIJ" → Field shows only "ABCDEF" → User understands the limit.

---

#### Test 14: `should show character count for name input`
**Purpose**: Verifies that the character counter updates dynamically for the participant name field.

**What it tests**:
- User can type into the "Your Name" field
- Character count displays and updates in real-time
- Format: "X/50 characters" (e.g., "5/50 characters" when 5 characters are entered)

**Why it matters**: Consistent with create session page. Provides immediate feedback about the 50-character limit (FR-020).

**User flow**: User types "Alice" into the name field → Sees "5/50 characters" indicator.

---

#### Test 15: `should navigate back on cancel`
**Purpose**: Verifies that users can exit the join session flow without joining.

**What it tests**:
- User can click the "Cancel" button
- After clicking, browser navigates back to home page (root URL)
- No join attempt is made during this process

**Why it matters**: Provides an escape route if users navigate to this page by mistake or change their mind. Essential for good UX.

**User flow**: User is on join page → Clicks "Cancel" → Returns to home page.

---

## Test Coverage Summary

### Pages Covered
1. **Home Page** (5 tests)
   - Content rendering
   - Navigation
   - Accessibility
   - Mobile responsiveness

2. **Create Session Page** (5 tests)
   - Form rendering
   - Input validation
   - Character counting
   - Button states
   - Navigation

3. **Join Session Page** (5 tests)
   - Form rendering
   - Input formatting (uppercase)
   - Input length limits
   - Character counting
   - Navigation

### Feature Areas Covered
- ✅ Navigation between pages
- ✅ Form rendering and accessibility
- ✅ Input validation and constraints
- ✅ Real-time feedback (character counts)
- ✅ Button state management (enabled/disabled)
- ✅ Mobile viewport compatibility
- ✅ Session code formatting

### Not Yet Covered (Future Tests)
- ❌ Session creation API integration
- ❌ Joining an existing session
- ❌ WebSocket connectivity
- ❌ Multi-participant flows
- ❌ Restaurant selection interface
- ❌ Results display
- ❌ Session expiration handling
- ❌ Error states (network failures, full sessions, etc.)

---

## Running the Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### View HTML report
```bash
npx playwright show-report
```

### Run specific test file
```bash
npx playwright test home.spec.ts
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### Debug mode
```bash
npx playwright test --debug
```

---

## Test Configuration

Tests run against:
- **Frontend URL**: http://localhost:3000
- **Backend URL**: http://localhost:3001 (required for WebSocket tests)
- **Browser**: Chromium (default)
- **Viewport**: 1280×720 (default), 390×844 (mobile tests)

---

## Maintenance Notes

### When to Update Tests

1. **UI Changes**: If button text, labels, or headings change, update the test selectors
2. **Validation Rules**: If character limits or format requirements change, update validation tests
3. **New Features**: Add new test suites when pages or features are added
4. **Bug Fixes**: Add regression tests when bugs are discovered and fixed

### Best Practices

- Use semantic selectors (`getByRole`, `getByLabel`) instead of CSS selectors for better accessibility testing
- Keep tests isolated - each test should be independent
- Use descriptive test names that explain what is being tested
- Group related tests in `describe` blocks
- Test user flows, not implementation details

---

## Related Documentation

- Feature Specification: `/specs/001-dinner-decider-enables/spec.md`
- Functional Requirements: FR-002, FR-003, FR-020
- Mobile Requirements: FR-014 (<200KB bundle, mobile-first)
