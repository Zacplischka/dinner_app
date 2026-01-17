import { Page, expect } from '@playwright/test';

/**
 * E2E Test Utility Functions
 *
 * Common helpers for:
 * - Network mocking
 * - WebSocket testing
 * - Visual regression
 * - Accessibility testing
 * - Performance monitoring
 */

// ============================================
// Network Utilities
// ============================================

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  url: string | RegExp,
  response: unknown,
  status = 200
): Promise<void> {
  await page.route(url, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Mock restaurant API with test data
 */
export async function mockRestaurantsApi(page: Page, restaurants: TestRestaurant[]): Promise<void> {
  await page.route('**/api/sessions/*/restaurants', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(restaurants),
    });
  });
}

/**
 * Block specific API calls (for error testing)
 */
export async function blockApi(page: Page, url: string | RegExp): Promise<void> {
  await page.route(url, (route) => {
    route.abort('failed');
  });
}

// ============================================
// WebSocket Utilities
// ============================================

/**
 * Wait for WebSocket event
 */
export async function waitForWebSocketEvent(
  page: Page,
  eventName: string,
  timeout = 10_000
): Promise<void> {
  await page.waitForFunction(
    (event) => {
      const win = window as unknown as { __lastSocketEvent?: string };
      return win.__lastSocketEvent === event;
    },
    eventName,
    { timeout }
  );
}

/**
 * Intercept WebSocket messages (for debugging)
 */
export async function interceptWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      console.log('[WS Send]', data);
      return originalSend.call(this, data);
    };
  });
}

// ============================================
// Visual Regression Utilities
// ============================================

/**
 * Take screenshot with consistent naming
 */
export async function takeSnapshot(
  page: Page,
  name: string,
  options?: { fullPage?: boolean; element?: string }
): Promise<void> {
  if (options?.element) {
    await page.locator(options.element).screenshot({
      path: `./test-results/snapshots/${name}.png`,
    });
  } else {
    await page.screenshot({
      path: `./test-results/snapshots/${name}.png`,
      fullPage: options?.fullPage ?? false,
    });
  }
}

/**
 * Compare screenshot (requires @playwright/test visual comparison)
 */
export async function expectScreenshot(
  page: Page,
  name: string,
  options?: { threshold?: number; maxDiffPixels?: number }
): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    threshold: options?.threshold ?? 0.1,
    maxDiffPixels: options?.maxDiffPixels,
  });
}

// ============================================
// Accessibility Utilities
// ============================================

/**
 * Check for common accessibility issues
 */
export async function checkAccessibility(page: Page): Promise<{
  passed: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check for images without alt text
  const imagesWithoutAlt = await page.locator('img:not([alt])').count();
  if (imagesWithoutAlt > 0) {
    issues.push(`${imagesWithoutAlt} images missing alt text`);
  }

  // Check for buttons without accessible names
  const buttons = await page.getByRole('button').all();
  for (const button of buttons) {
    const name = await button.getAttribute('aria-label') || await button.textContent();
    if (!name?.trim()) {
      issues.push('Button without accessible name found');
    }
  }

  // Check for form inputs without labels
  const inputs = await page.locator('input:not([type="hidden"])').all();
  for (const input of inputs) {
    const id = await input.getAttribute('id');
    const ariaLabel = await input.getAttribute('aria-label');
    const ariaLabelledBy = await input.getAttribute('aria-labelledby');

    if (!ariaLabel && !ariaLabelledBy && id) {
      const hasLabel = await page.locator(`label[for="${id}"]`).count() > 0;
      if (!hasLabel) {
        issues.push(`Input "${id}" missing label`);
      }
    }
  }

  // Check color contrast (basic check for text visibility)
  // More comprehensive checks would require axe-playwright

  return {
    passed: issues.length === 0,
    issues,
  };
}

// ============================================
// Performance Utilities
// ============================================

/**
 * Measure page load time
 */
export async function measurePageLoad(page: Page): Promise<{
  domContentLoaded: number;
  load: number;
  firstContentfulPaint: number;
}> {
  const metrics = await page.evaluate(() => {
    const perf = performance;
    const timing = perf.timing;
    const entries = perf.getEntriesByType('paint');
    const fcp = entries.find((e) => e.name === 'first-contentful-paint');

    return {
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      load: timing.loadEventEnd - timing.navigationStart,
      firstContentfulPaint: fcp?.startTime || 0,
    };
  });

  return metrics;
}

/**
 * Assert page loads within target time
 */
export async function expectFastPageLoad(
  page: Page,
  maxLoadTime = 3000
): Promise<void> {
  const metrics = await measurePageLoad(page);
  expect(metrics.load).toBeLessThan(maxLoadTime);
}

// ============================================
// Test Data Utilities
// ============================================

export interface TestRestaurant {
  placeId: string;
  name: string;
  rating: number;
  priceLevel: number;
  cuisine: string;
  imageUrl: string;
  distance: string;
  address: string;
}

/**
 * Generate mock restaurants for testing
 */
export function generateMockRestaurants(count = 10): TestRestaurant[] {
  const cuisines = ['Italian', 'Mexican', 'Japanese', 'American', 'Thai', 'Indian', 'Chinese'];
  const restaurants: TestRestaurant[] = [];

  for (let i = 0; i < count; i++) {
    restaurants.push({
      placeId: `place_${i}`,
      name: `Test Restaurant ${i + 1}`,
      rating: 3.5 + Math.random() * 1.5,
      priceLevel: Math.floor(Math.random() * 4) + 1,
      cuisine: cuisines[i % cuisines.length],
      imageUrl: `https://picsum.photos/400/300?random=${i}`,
      distance: `${(Math.random() * 2).toFixed(1)} mi`,
      address: `${100 + i} Test Street`,
    });
  }

  return restaurants;
}

/**
 * Generate unique participant names
 */
export function generateParticipantNames(count: number): string[] {
  const names = [
    'Alice', 'Bob', 'Charlie', 'Diana', 'Eve',
    'Frank', 'Grace', 'Henry', 'Ivy', 'Jack',
  ];
  return names.slice(0, count);
}

// ============================================
// Wait Utilities
// ============================================

/**
 * Wait for element to be stable (not animating)
 */
export async function waitForStable(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible' });

  // Wait for position to stabilize
  let lastBox = await element.boundingBox();
  let stable = false;

  for (let i = 0; i < 10 && !stable; i++) {
    await page.waitForTimeout(100);
    const currentBox = await element.boundingBox();
    if (
      lastBox?.x === currentBox?.x &&
      lastBox?.y === currentBox?.y &&
      lastBox?.width === currentBox?.width &&
      lastBox?.height === currentBox?.height
    ) {
      stable = true;
    }
    lastBox = currentBox;
  }
}

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Retry action with exponential backoff
 */
export async function retry<T>(
  action: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}
