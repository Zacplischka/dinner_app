import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Dinder E2E Tests
 *
 * Key features:
 * - Mobile-first testing (iPhone 12 Pro as primary viewport)
 * - Cross-browser support (Chromium, Firefox, Safari, Mobile)
 * - Parallel execution with proper test isolation
 * - Visual regression support
 * - Accessibility testing ready
 */

// Read environment from process.env with sensible defaults
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const CI = !!process.env.CI;

export default defineConfig({
  // Test directory configuration
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Parallel execution - increase for CI
  fullyParallel: true,
  workers: CI ? 4 : 2,

  // Fail fast in CI, allow retries for flaky tests
  retries: CI ? 2 : 0,
  forbidOnly: CI,

  // Reporter configuration
  reporter: CI
    ? [
        ['html', { outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['github'], // GitHub Actions annotations
      ]
    : [['html', { open: 'never' }], ['list']],

  // Test output
  outputDir: 'test-results',

  // Global test timeout
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: BASE_URL,

    // Collect trace on failure for debugging
    trace: 'on-first-retry',

    // Screenshots on failure
    screenshot: 'only-on-failure',

    // Video on failure (helps debug flaky tests)
    video: CI ? 'on-first-retry' : 'off',

    // Action timeout
    actionTimeout: 10_000,

    // Navigation timeout
    navigationTimeout: 15_000,

    // Accessibility: wait for no network activity
    ...(CI ? {} : { launchOptions: { slowMo: 50 } }),
  },

  // Define test projects for different browsers/devices
  projects: [
    // ============================================
    // Mobile-First Testing (Primary)
    // ============================================
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 12 Pro'],
        // Override viewport for exact FR-014 requirements
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12 Pro'],
        viewport: { width: 390, height: 844 },
      },
    },

    // ============================================
    // Desktop Browsers
    // ============================================
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
    },

    // ============================================
    // Tablet Testing
    // ============================================
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro 11'],
      },
    },

    // ============================================
    // Android Testing
    // ============================================
    {
      name: 'android',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],

  // Web server configuration - start frontend before tests
  // In CI, servers are started by the workflow, so webServer is disabled
  // In local development, webServer starts preview on port 3000 to match BASE_URL
  webServer: CI
    ? undefined
    : [
        {
          command: 'npm run build && npm run preview -- --port 3000',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        // Also start backend for local E2E testing
        {
          command: 'cd ../backend && npm run build && npm start',
          url: `${BACKEND_URL}/health`,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],

  // Global setup and teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
