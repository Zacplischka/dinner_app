import { FullConfig } from '@playwright/test';

/**
 * Global Teardown for Playwright E2E Tests
 *
 * This runs once after all tests to:
 * 1. Clean up any test data
 * 2. Generate final reports
 * 3. Log test completion summary
 */

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 E2E Test Teardown');

  // Add any cleanup logic here
  // For example, clearing test sessions from Redis

  console.log('   ✓ Cleanup complete');
  console.log('\n📊 View report: npx playwright show-report\n');
}

export default globalTeardown;
