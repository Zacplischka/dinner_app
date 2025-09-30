import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Test: No overlap, restart flow
 *
 * Scenario:
 * - Multiple participants submit selections with no overlap
 * - System shows "No matching options" message
 * - Participant clicks "Restart Session"
 * - Selections are cleared and participants return to selection screen
 *
 * Tests FR-016: No automated fallback for no overlap
 * Tests FR-012, FR-013: Session restart clears selections, preserves participants
 */

test.describe('No overlap and restart flow', () => {
  let alicePage: Page;
  let bobPage: Page;
  let sessionCode: string;

  test.beforeAll(async ({ browser }) => {
    alicePage = await browser.newPage();
    bobPage = await browser.newPage();

    await alicePage.setViewportSize({ width: 390, height: 844 });
    await bobPage.setViewportSize({ width: 390, height: 844 });
  });

  test.afterAll(async () => {
    await alicePage.close();
    await bobPage.close();
  });

  test('Setup: Alice creates session', async () => {
    await alicePage.goto('/');
    await alicePage.click('text=Create Session');
    await alicePage.fill('input[name="hostName"]', 'Alice');
    await alicePage.click('button:has-text("Create")');

    await alicePage.waitForURL(/\/session\/[A-Z0-9]{6}/);

    const url = alicePage.url();
    const match = url.match(/\/session\/([A-Z0-9]{6})/);
    sessionCode = match![1];
  });

  test('Setup: Bob joins session', async () => {
    await bobPage.goto('/');
    await bobPage.click('text=Join Session');
    await bobPage.fill('input[name="sessionCode"]', sessionCode);
    await bobPage.fill('input[name="displayName"]', 'Bob');
    await bobPage.click('button:has-text("Join")');

    await bobPage.waitForURL(`/session/${sessionCode}`);
  });

  test('Setup: Both navigate to selection screen', async () => {
    await alicePage.click('button:has-text("Start Selecting")');
    await bobPage.click('button:has-text("Start Selecting")');

    await alicePage.waitForURL(`/session/${sessionCode}/select`);
    await bobPage.waitForURL(`/session/${sessionCode}/select`);
  });

  test('Alice selects unique options (no overlap)', async () => {
    // Alice selects pizza and italian
    await alicePage.check('input[value="pizza-palace"]');
    await alicePage.check('input[value="italian-villa"]');

    await alicePage.click('button:has-text("Submit Selections")');

    // Wait for submission
    await expect(alicePage.locator('text=/\\d+\\/2 participants have submitted/')).toBeVisible();
  });

  test('Bob selects different options (no overlap with Alice)', async () => {
    // Bob selects completely different options
    await bobPage.check('input[value="chinese-express"]');
    await bobPage.check('input[value="indian-curry"]');

    await bobPage.click('button:has-text("Submit Selections")');
  });

  test('Both participants see "No matching options" message', async () => {
    // Navigate to results page automatically
    await alicePage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });
    await bobPage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });

    // Verify "No matching options" message displayed
    await expect(alicePage.locator('text=/No matching options/i')).toBeVisible();
    await expect(bobPage.locator('text=/No matching options/i')).toBeVisible();

    // Verify no overlapping options shown
    await expect(alicePage.locator('[data-testid="overlapping-options"]')).toBeEmpty();
    await expect(bobPage.locator('[data-testid="overlapping-options"]')).toBeEmpty();
  });

  test('Results show all selections despite no overlap', async () => {
    // FR-011: All selections revealed even with no overlap
    for (const page of [alicePage, bobPage]) {
      // Alice's selections
      await expect(page.locator('[data-testid="participant-selections-Alice"] >> text=Pizza Palace')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Alice"] >> text=Italian Villa')).toBeVisible();

      // Bob's selections
      await expect(page.locator('[data-testid="participant-selections-Bob"] >> text=Chinese Express')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Bob"] >> text=Indian Curry')).toBeVisible();
    }
  });

  test('"Restart Session" button is visible', async () => {
    await expect(alicePage.locator('button:has-text("Restart Session")')).toBeVisible();
    await expect(bobPage.locator('button:has-text("Restart Session")')).toBeVisible();

    // Touch target validation (≥44x44px per spec)
    const button = alicePage.locator('button:has-text("Restart Session")');
    const box = await button.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('Alice clicks "Restart Session"', async () => {
    await alicePage.click('button:has-text("Restart Session")');

    // Should navigate back to selection screen
    await alicePage.waitForURL(`/session/${sessionCode}/select`, { timeout: 5000 });

    // Verify selections are cleared (no checkboxes should be checked)
    const checkedBoxes = alicePage.locator('input[type="checkbox"]:checked');
    await expect(checkedBoxes).toHaveCount(0);
  });

  test('Bob automatically returns to selection screen', async () => {
    // Bob's page should automatically navigate on session:restarted event
    await bobPage.waitForURL(`/session/${sessionCode}/select`, { timeout: 5000 });

    // Verify Bob's previous selections are also cleared
    const checkedBoxes = bobPage.locator('input[type="checkbox"]:checked');
    await expect(checkedBoxes).toHaveCount(0);
  });

  test('Participant list preserved after restart', async () => {
    // FR-013: Restart preserves participants
    // Navigate back to lobby to check
    await alicePage.goto(`/session/${sessionCode}`);
    await bobPage.goto(`/session/${sessionCode}`);

    // Both participants still in session
    await expect(alicePage.locator('text=Alice')).toBeVisible();
    await expect(alicePage.locator('text=Bob')).toBeVisible();
    await expect(bobPage.locator('text=Alice')).toBeVisible();
    await expect(bobPage.locator('text=Bob')).toBeVisible();

    const participants = alicePage.locator('[data-testid="participant-list"] > *');
    await expect(participants).toHaveCount(2);
  });

  test('Participants can reselect with overlap after restart', async () => {
    // Return to selection screen
    await alicePage.goto(`/session/${sessionCode}/select`);
    await bobPage.goto(`/session/${sessionCode}/select`);

    // This time, select overlapping options
    await alicePage.check('input[value="sushi-spot"]');
    await alicePage.check('input[value="thai-kitchen"]');
    await alicePage.click('button:has-text("Submit Selections")');

    await bobPage.check('input[value="sushi-spot"]');
    await bobPage.check('input[value="thai-kitchen"]');
    await bobPage.click('button:has-text("Submit Selections")');

    // Should show results with overlap this time
    await alicePage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });
    await bobPage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });

    // Verify overlap displayed
    await expect(alicePage.locator('[data-testid="overlapping-options"] >> text=Sushi Spot')).toBeVisible();
    await expect(alicePage.locator('[data-testid="overlapping-options"] >> text=Thai Kitchen')).toBeVisible();

    // Should NOT show "No matching options" message
    await expect(alicePage.locator('text=/No matching options/i')).not.toBeVisible();
  });
});