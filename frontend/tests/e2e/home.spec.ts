import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should display welcome screen with navigation options', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check title and description
    await expect(page.getByRole('heading', { name: /Dinner Decider/i })).toBeVisible();
    await expect(page.getByText(/Find restaurants everyone agrees on/i)).toBeVisible();

    // Check action buttons
    await expect(page.getByRole('button', { name: /Create Session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join Session/i })).toBeVisible();

    // Check info text
    await expect(page.getByText(/No sign-up required/i)).toBeVisible();
    await expect(page.getByText(/Up to 4 participants/i)).toBeVisible();
    await expect(page.getByText(/Private selections until everyone submits/i)).toBeVisible();
  });

  test('should navigate to create session page', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.getByRole('button', { name: /Create Session/i }).click();

    await expect(page).toHaveURL(/\/create/);
  });

  test('should navigate to join session page', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.getByRole('button', { name: /Join Session/i }).click();

    await expect(page).toHaveURL(/\/join/);
  });

  test('should have accessible button elements', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const createButton = page.getByRole('button', { name: /Create Session/i });
    const joinButton = page.getByRole('button', { name: /Join Session/i });

    // Check buttons are properly accessible
    await expect(createButton).toBeEnabled();
    await expect(joinButton).toBeEnabled();
  });

  test('should display mobile-friendly layout', async ({ page }) => {
    // Set mobile viewport (iPhone 12 Pro)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3000');

    // Verify content is visible in mobile viewport
    await expect(page.getByRole('heading', { name: /Dinner Decider/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join Session/i })).toBeVisible();
  });
});

test.describe('Create Session Page', () => {
  test('should display create session form', async ({ page }) => {
    await page.goto('http://localhost:3000/create');

    await expect(page.getByRole('heading', { name: /Create Session/i })).toBeVisible();
    await expect(page.getByLabel(/Your Name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  });

  test('should show character count for name input', async ({ page }) => {
    await page.goto('http://localhost:3000/create');

    const nameInput = page.getByLabel(/Your Name/i);
    await nameInput.fill('John');

    await expect(page.getByText(/4\/50 characters/i)).toBeVisible();
  });

  test('should disable submit button when name is empty', async ({ page }) => {
    await page.goto('http://localhost:3000/create');

    const submitButton = page.getByRole('button', { name: /Create Session/i });
    await expect(submitButton).toBeDisabled();
  });

  test('should enable submit button when name is filled', async ({ page }) => {
    await page.goto('http://localhost:3000/create');

    await page.getByLabel(/Your Name/i).fill('John');

    const submitButton = page.getByRole('button', { name: /Create Session/i });
    await expect(submitButton).toBeEnabled();
  });

  test('should navigate back on cancel', async ({ page }) => {
    await page.goto('http://localhost:3000/create');

    await page.getByRole('button', { name: /Cancel/i }).click();

    await expect(page).toHaveURL('http://localhost:3000/');
  });
});

test.describe('Join Session Page', () => {
  test('should display join session form', async ({ page }) => {
    await page.goto('http://localhost:3000/join');

    await expect(page.getByRole('heading', { name: /Join Session/i })).toBeVisible();
    await expect(page.getByLabel(/Session Code/i)).toBeVisible();
    await expect(page.getByLabel(/Your Name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Join Session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  });

  test('should format session code to uppercase', async ({ page }) => {
    await page.goto('http://localhost:3000/join');

    const sessionCodeInput = page.getByLabel(/Session Code/i);
    await sessionCodeInput.fill('abc123');

    await expect(sessionCodeInput).toHaveValue('ABC123');
  });

  test('should limit session code to 6 characters', async ({ page }) => {
    await page.goto('http://localhost:3000/join');

    const sessionCodeInput = page.getByLabel(/Session Code/i);
    await sessionCodeInput.fill('ABCDEFGHIJ');

    await expect(sessionCodeInput).toHaveValue('ABCDEF');
  });

  test('should show character count for name input', async ({ page }) => {
    await page.goto('http://localhost:3000/join');

    const nameInput = page.getByLabel(/Your Name/i);
    await nameInput.fill('Alice');

    await expect(page.getByText(/5\/50 characters/i)).toBeVisible();
  });

  test('should navigate back on cancel', async ({ page }) => {
    await page.goto('http://localhost:3000/join');

    await page.getByRole('button', { name: /Cancel/i }).click();

    await expect(page).toHaveURL('http://localhost:3000/');
  });
});
