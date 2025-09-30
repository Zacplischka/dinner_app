import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Test: Session full rejection
 *
 * Scenario:
 * - 4 participants join a session (maximum allowed per FR-004)
 * - 5th participant attempts to join
 * - System rejects 5th participant with "Session is full" error
 *
 * Tests FR-005: Prevent more than 4 participants from joining
 */

test.describe('Session full rejection', () => {
  let pages: Page[] = [];
  let sessionCode: string;

  test.beforeAll(async ({ browser }) => {
    // Create 5 separate browser contexts (4 will succeed, 1 will be rejected)
    for (let i = 0; i < 5; i++) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      pages.push(page);
    }
  });

  test.afterAll(async () => {
    for (const page of pages) {
      await page.close();
    }
  });

  test('Participant 1 creates session', async () => {
    const page = pages[0];
    await page.goto('/');
    await page.click('text=Create Session');
    await page.fill('input[name="hostName"]', 'Participant 1');
    await page.click('button:has-text("Create")');

    await page.waitForURL(/\/session\/[A-Z0-9]{6}/);

    const url = page.url();
    const match = url.match(/\/session\/([A-Z0-9]{6})/);
    expect(match).toBeTruthy();
    sessionCode = match![1];

    // Verify participant 1 in list
    await expect(page.locator('text=Participant 1')).toBeVisible();
  });

  test('Participants 2, 3, 4 join successfully', async () => {
    for (let i = 1; i < 4; i++) {
      const page = pages[i];
      const participantName = `Participant ${i + 1}`;

      await page.goto('/');
      await page.click('text=Join Session');
      await page.fill('input[name="sessionCode"]', sessionCode);
      await page.fill('input[name="displayName"]', participantName);
      await page.click('button:has-text("Join")');

      // Should successfully join
      await page.waitForURL(`/session/${sessionCode}`, { timeout: 5000 });

      // Verify participant appears in list
      await expect(page.locator(`text=${participantName}`)).toBeVisible();
    }
  });

  test('All 4 participants see complete list', async () => {
    // Verify all 4 pages show 4 participants
    for (let i = 0; i < 4; i++) {
      const page = pages[i];
      const participants = page.locator('[data-testid="participant-list"] > *');
      await expect(participants).toHaveCount(4, { timeout: 5000 });

      // Verify all names visible
      await expect(page.locator('text=Participant 1')).toBeVisible();
      await expect(page.locator('text=Participant 2')).toBeVisible();
      await expect(page.locator('text=Participant 3')).toBeVisible();
      await expect(page.locator('text=Participant 4')).toBeVisible();
    }
  });

  test('5th participant attempts to join', async () => {
    const page = pages[4];

    await page.goto('/');
    await page.click('text=Join Session');
    await page.fill('input[name="sessionCode"]', sessionCode);
    await page.fill('input[name="displayName"]', 'Participant 5');
    await page.click('button:has-text("Join")');

    // Should see error message (not navigate to session)
    await expect(page.locator('text=/Session is full/i')).toBeVisible({ timeout: 5000 });

    // Should NOT navigate to session page
    await expect(page).not.toHaveURL(`/session/${sessionCode}`);

    // Should remain on join page
    await expect(page).toHaveURL(/\/join/);
  });

  test('5th participant cannot bypass limit by retrying', async () => {
    const page = pages[4];

    // Try again
    await page.fill('input[name="sessionCode"]', sessionCode);
    await page.fill('input[name="displayName"]', 'Participant 5 Retry');
    await page.click('button:has-text("Join")');

    // Should see error again
    await expect(page.locator('text=/Session is full/i')).toBeVisible({ timeout: 5000 });
    await expect(page).not.toHaveURL(`/session/${sessionCode}`);
  });

  test('Session remains stable with 4 participants', async () => {
    // Verify participant count hasn't changed
    for (let i = 0; i < 4; i++) {
      const page = pages[i];

      // Navigate to lobby to refresh
      await page.goto(`/session/${sessionCode}`);

      // Should still show exactly 4 participants
      const participants = page.locator('[data-testid="participant-list"] > *');
      await expect(participants).toHaveCount(4);

      // Should NOT show Participant 5
      await expect(page.locator('text=Participant 5')).not.toBeVisible();
    }
  });

  test('If one participant leaves, 5th can join', async () => {
    const leavingPage = pages[3];
    const joiningPage = pages[4];

    // Simulate Participant 4 closing browser/disconnecting
    await leavingPage.close();

    // Wait a moment for disconnect to propagate
    await pages[0].waitForTimeout(2000);

    // Check participant count reduced to 3
    const participants = pages[0].locator('[data-testid="participant-list"] > *');
    await expect(participants).toHaveCount(3, { timeout: 5000 });

    // Now 5th participant should be able to join
    await joiningPage.goto('/');
    await joiningPage.click('text=Join Session');
    await joiningPage.fill('input[name="sessionCode"]', sessionCode);
    await joiningPage.fill('input[name="displayName"]', 'Participant 5');
    await joiningPage.click('button:has-text("Join")');

    // Should successfully join this time
    await joiningPage.waitForURL(`/session/${sessionCode}`, { timeout: 5000 });

    // Verify Participant 5 appears in list
    await expect(joiningPage.locator('text=Participant 5')).toBeVisible();

    // Verify other participants see Participant 5
    await expect(pages[0].locator('text=Participant 5')).toBeVisible({ timeout: 5000 });

    // Participant count back to 4
    const updatedParticipants = pages[0].locator('[data-testid="participant-list"] > *');
    await expect(updatedParticipants).toHaveCount(4);
  });

  test('Error message styling is mobile-friendly', async () => {
    // Recreate scenario where session is full
    const testPage = await pages[0].context().newPage();
    await testPage.setViewportSize({ width: 390, height: 844 });

    await testPage.goto('/');
    await testPage.click('text=Join Session');
    await testPage.fill('input[name="sessionCode"]', sessionCode);
    await testPage.fill('input[name="displayName"]', 'Test User');
    await testPage.click('button:has-text("Join")');

    // Wait for error message
    const errorMessage = testPage.locator('text=/Session is full/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Verify error is readable on mobile (not cut off)
    const box = await errorMessage.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(390 - 32); // Account for padding

    // Verify error has sufficient contrast (should be noticeable)
    // Playwright doesn't directly check contrast, but we verify it's visible
    await expect(errorMessage).toBeVisible();

    await testPage.close();
  });
});