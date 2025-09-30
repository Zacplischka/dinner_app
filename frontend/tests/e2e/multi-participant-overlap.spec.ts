import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Test: Multi-participant flow with overlap
 *
 * Scenario (from quickstart.md):
 * - Alice creates session
 * - Bob joins via session code
 * - Charlie joins via session code
 * - All three select overlapping dinner options
 * - Results automatically display when all submit
 *
 * Tests:
 * - Real-time UI updates on participant:joined events
 * - Selection privacy (selections hidden until all submit)
 * - Results automatically display with overlapping options
 */

test.describe('Multi-participant flow with overlap', () => {
  let alicePage: Page;
  let bobPage: Page;
  let charliePage: Page;
  let sessionCode: string;

  test.beforeAll(async ({ browser }) => {
    // Create three separate browser contexts (simulating 3 different users)
    alicePage = await browser.newPage();
    bobPage = await browser.newPage();
    charliePage = await browser.newPage();

    // Set mobile viewport for all pages
    await alicePage.setViewportSize({ width: 390, height: 844 });
    await bobPage.setViewportSize({ width: 390, height: 844 });
    await charliePage.setViewportSize({ width: 390, height: 844 });
  });

  test.afterAll(async () => {
    await alicePage.close();
    await bobPage.close();
    await charliePage.close();
  });

  test('Alice creates session and becomes host', async () => {
    await alicePage.goto('/');

    // Click "Create Session" button
    await alicePage.click('text=Create Session');

    // Enter host name
    await alicePage.fill('input[name="hostName"]', 'Alice');

    // Submit form
    await alicePage.click('button:has-text("Create")');

    // Should navigate to session lobby
    await alicePage.waitForURL(/\/session\/[A-Z0-9]{6}/);

    // Extract session code from URL
    const url = alicePage.url();
    const match = url.match(/\/session\/([A-Z0-9]{6})/);
    expect(match).toBeTruthy();
    sessionCode = match![1];

    // Verify Alice appears in participant list
    await expect(alicePage.locator('text=Alice')).toBeVisible();
  });

  test('Bob joins session via code', async () => {
    await bobPage.goto('/');

    // Click "Join Session" button
    await bobPage.click('text=Join Session');

    // Enter session code and display name
    await bobPage.fill('input[name="sessionCode"]', sessionCode);
    await bobPage.fill('input[name="displayName"]', 'Bob');

    // Submit form
    await bobPage.click('button:has-text("Join")');

    // Should navigate to session lobby
    await bobPage.waitForURL(`/session/${sessionCode}`);

    // Verify Bob appears in participant list
    await expect(bobPage.locator('text=Bob')).toBeVisible();

    // Verify Alice also appears (existing participant)
    await expect(bobPage.locator('text=Alice')).toBeVisible();
  });

  test('Alice sees Bob join in real-time', async () => {
    // Alice's page should update to show Bob without refresh
    await expect(alicePage.locator('text=Bob')).toBeVisible({ timeout: 5000 });

    // Should now show 2 participants
    const participants = alicePage.locator('[data-testid="participant-list"] > *');
    await expect(participants).toHaveCount(2);
  });

  test('Charlie joins session', async () => {
    await charliePage.goto('/');

    // Navigate to join page
    await charliePage.click('text=Join Session');

    // Enter session code and display name
    await charliePage.fill('input[name="sessionCode"]', sessionCode);
    await charliePage.fill('input[name="displayName"]', 'Charlie');

    // Submit form
    await charliePage.click('button:has-text("Join")');

    // Should navigate to session lobby
    await charliePage.waitForURL(`/session/${sessionCode}`);

    // Verify all three participants visible
    await expect(charliePage.locator('text=Alice')).toBeVisible();
    await expect(charliePage.locator('text=Bob')).toBeVisible();
    await expect(charliePage.locator('text=Charlie')).toBeVisible();
  });

  test('All participants see updated participant count', async () => {
    // All three pages should show 3 participants
    for (const page of [alicePage, bobPage, charliePage]) {
      const participants = page.locator('[data-testid="participant-list"] > *');
      await expect(participants).toHaveCount(3, { timeout: 5000 });
    }
  });

  test('Participants navigate to selection screen', async () => {
    // All participants click "Start Selecting" button
    await alicePage.click('button:has-text("Start Selecting")');
    await bobPage.click('button:has-text("Start Selecting")');
    await charliePage.click('button:has-text("Start Selecting")');

    // All should navigate to selection screen
    await alicePage.waitForURL(`/session/${sessionCode}/select`);
    await bobPage.waitForURL(`/session/${sessionCode}/select`);
    await charliePage.waitForURL(`/session/${sessionCode}/select`);

    // Verify dinner options are displayed
    await expect(alicePage.locator('[data-testid="option-selector"]')).toBeVisible();
    await expect(bobPage.locator('[data-testid="option-selector"]')).toBeVisible();
    await expect(charliePage.locator('[data-testid="option-selector"]')).toBeVisible();
  });

  test('Alice makes selections', async () => {
    // Select 3 overlapping options (these will overlap with Bob and Charlie)
    await alicePage.check('input[value="pizza-palace"]');
    await alicePage.check('input[value="sushi-spot"]');
    await alicePage.check('input[value="thai-kitchen"]');

    // Submit selections
    await alicePage.click('button:has-text("Submit Selections")');

    // Should show waiting screen
    await expect(alicePage.locator('text=/\\d+\\/3 participants have submitted/')).toBeVisible();
  });

  test('Other participants see Alice submitted (without revealing choices)', async () => {
    // Bob and Charlie should see submission count update
    await expect(bobPage.locator('text=/1\\/3 participants have submitted/')).toBeVisible({ timeout: 5000 });
    await expect(charliePage.locator('text=/1\\/3 participants have submitted/')).toBeVisible({ timeout: 5000 });

    // But Alice's selections should NOT be visible (privacy per FR-023)
    await expect(bobPage.locator('text=pizza-palace')).not.toBeVisible();
    await expect(charliePage.locator('text=pizza-palace')).not.toBeVisible();
  });

  test('Bob submits selections with overlap', async () => {
    // Select options that overlap with Alice: sushi-spot, thai-kitchen
    await bobPage.check('input[value="sushi-spot"]');
    await bobPage.check('input[value="thai-kitchen"]');
    await bobPage.check('input[value="mexican-grill"]');

    // Submit selections
    await bobPage.click('button:has-text("Submit Selections")');

    // Should show 2/3 submitted
    await expect(bobPage.locator('text=/2\\/3 participants have submitted/')).toBeVisible();
  });

  test('Charlie submits final selections', async () => {
    // Select options that overlap: sushi-spot, thai-kitchen
    await charliePage.check('input[value="sushi-spot"]');
    await charliePage.check('input[value="thai-kitchen"]');
    await charliePage.check('input[value="indian-curry"]');

    // Submit selections
    await charliePage.click('button:has-text("Submit Selections")');
  });

  test('All participants automatically see results with overlap', async () => {
    // All three pages should automatically navigate to results
    await alicePage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });
    await bobPage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });
    await charliePage.waitForURL(`/session/${sessionCode}/results`, { timeout: 5000 });

    // Verify overlapping options are displayed
    for (const page of [alicePage, bobPage, charliePage]) {
      // Should show the 2 overlapping options: Sushi Spot and Thai Kitchen
      await expect(page.locator('text=Sushi Spot')).toBeVisible();
      await expect(page.locator('text=Thai Kitchen')).toBeVisible();

      // Should NOT show non-overlapping options prominently
      await expect(page.locator('[data-testid="overlapping-options"] >> text=Pizza Palace')).not.toBeVisible();
      await expect(page.locator('[data-testid="overlapping-options"] >> text=Mexican Grill')).not.toBeVisible();
      await expect(page.locator('[data-testid="overlapping-options"] >> text=Indian Curry')).not.toBeVisible();
    }
  });

  test('Results show all participants selections', async () => {
    // Verify all selections are revealed (FR-011)
    for (const page of [alicePage, bobPage, charliePage]) {
      // Alice's selections
      await expect(page.locator('text=Alice')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Alice"] >> text=Pizza Palace')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Alice"] >> text=Sushi Spot')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Alice"] >> text=Thai Kitchen')).toBeVisible();

      // Bob's selections
      await expect(page.locator('text=Bob')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Bob"] >> text=Sushi Spot')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Bob"] >> text=Thai Kitchen')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Bob"] >> text=Mexican Grill')).toBeVisible();

      // Charlie's selections
      await expect(page.locator('text=Charlie')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Charlie"] >> text=Sushi Spot')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Charlie"] >> text=Thai Kitchen')).toBeVisible();
      await expect(page.locator('[data-testid="participant-selections-Charlie"] >> text=Indian Curry')).toBeVisible();
    }
  });
});