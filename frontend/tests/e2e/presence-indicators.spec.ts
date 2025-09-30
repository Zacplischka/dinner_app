import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Test: Presence indicators
 *
 * Scenario:
 * - Alice creates session
 * - Bob joins session (both see each other as online)
 * - Bob disconnects (Alice sees Bob as disconnected/offline)
 * - Bob reconnects (Alice sees Bob as online again)
 *
 * Tests:
 * - Real-time presence updates via participant:joined events
 * - Offline indicators via participant:left events
 * - Disconnected participants remain in list (FR-025)
 * - Presence indicators with accessibility attributes
 */

test.describe('Presence indicators', () => {
  let alicePage: Page;
  let bobPage: Page;
  let sessionCode: string;

  test.beforeAll(async ({ browser }) => {
    // Create two separate browser contexts
    alicePage = await browser.newPage();
    bobPage = await browser.newPage();

    // Set mobile viewport
    await alicePage.setViewportSize({ width: 390, height: 844 });
    await bobPage.setViewportSize({ width: 390, height: 844 });
  });

  test.afterAll(async () => {
    await alicePage.close();
    await bobPage.close();
  });

  test('Alice creates session', async () => {
    await alicePage.goto('/');
    await alicePage.click('text=Create Session');
    await alicePage.fill('input[name="hostName"]', 'Alice');
    await alicePage.click('button:has-text("Create")');

    // Extract session code
    await alicePage.waitForSelector('[data-testid="session-code"], text=/[A-Z0-9]{6}/');
    const codeElement = await alicePage.locator(
      '[data-testid="session-code"], text=/[A-Z0-9]{6}/'
    ).first();
    sessionCode = (await codeElement.textContent()) || '';
    console.log('Session code:', sessionCode);

    // Verify Alice sees herself as online
    await expect(alicePage.locator('text=Alice')).toBeVisible();
    const aliceIndicator = alicePage.locator('text=Alice').locator('..').locator('[role="status"]');
    await expect(aliceIndicator).toHaveClass(/text-green-500/);
  });

  test('Bob joins and both see each other as online', async () => {
    await bobPage.goto('/');
    await bobPage.click('text=Join Session');
    await bobPage.fill('input[name="sessionCode"]', sessionCode);
    await bobPage.fill('input[name="displayName"]', 'Bob');
    await bobPage.click('button:has-text("Join")');

    // Wait for Bob to join
    await bobPage.waitForSelector('text=Alice');

    // Bob sees Alice as online
    const aliceIndicatorBob = bobPage.locator('text=Alice').locator('..').locator('[role="status"]');
    await expect(aliceIndicatorBob).toHaveClass(/text-green-500/);
    await expect(aliceIndicatorBob).toHaveAttribute('aria-label', 'Online');

    // Bob sees himself as online
    const bobIndicatorBob = bobPage.locator('text=Bob').locator('..').locator('[role="status"]');
    await expect(bobIndicatorBob).toHaveClass(/text-green-500/);

    // Alice sees Bob as online
    await alicePage.waitForSelector('text=Bob');
    const bobIndicatorAlice = alicePage.locator('text=Bob').locator('..').locator('[role="status"]');
    await expect(bobIndicatorAlice).toHaveClass(/text-green-500/);
    await expect(bobIndicatorAlice).toHaveAttribute('aria-label', 'Online');

    // Verify participant count shows 2
    await expect(alicePage.locator('text=/2.*participants?/i')).toBeVisible();
  });

  test('Bob disconnects and Alice sees him as disconnected', async () => {
    // Close Bob's page to simulate disconnect
    await bobPage.close();

    // Wait a moment for disconnect event to propagate
    await alicePage.waitForTimeout(1000);

    // Alice still sees Bob in the list (FR-025)
    await expect(alicePage.locator('text=Bob')).toBeVisible();

    // But Bob's indicator is now gray/offline
    const bobIndicatorAlice = alicePage.locator('text=Bob').locator('..').locator('[role="status"]');
    await expect(bobIndicatorAlice).toHaveClass(/text-gray-400/);
    await expect(bobIndicatorAlice).toHaveAttribute('aria-label', 'Disconnected');

    // Alice sees "Disconnected" text for Bob
    const bobRow = alicePage.locator('text=Bob').locator('..');
    await expect(bobRow.locator('text=Disconnected')).toBeVisible();

    // Participant count still shows 2 (FR-025)
    await expect(alicePage.locator('text=/2.*participants?/i')).toBeVisible();
  });

  test('Bob reconnects and shows as online again', async () => {
    // Create new page for Bob (simulating reconnect)
    const { browser } = await import('@playwright/test');
    const context = await (await browser).newContext();
    bobPage = await context.newPage();
    await bobPage.setViewportSize({ width: 390, height: 844 });

    // Bob rejoins the session
    await bobPage.goto('/');
    await bobPage.click('text=Join Session');
    await bobPage.fill('input[name="sessionCode"]', sessionCode);
    await bobPage.fill('input[name="displayName"]', 'Bob');
    await bobPage.click('button:has-text("Join")');

    // Wait for Bob to rejoin
    await bobPage.waitForSelector('text=Alice');

    // Alice sees a new Bob entry as online (new socket.id)
    // Note: This creates a new participant entry, old one remains offline per FR-025
    await alicePage.waitForTimeout(1000);

    // Count how many "Bob" entries exist
    const bobEntries = await alicePage.locator('text=Bob').count();
    expect(bobEntries).toBeGreaterThanOrEqual(1);

    // At least one Bob entry should be online
    const onlineBobIndicators = alicePage.locator('[role="status"]').locator('visible=true');
    const greenIndicators = await onlineBobIndicators.evaluateAll((elements) =>
      elements.filter((el) => el.className.includes('text-green-500'))
    );
    expect(greenIndicators.length).toBeGreaterThanOrEqual(2); // Alice + new Bob
  });
});