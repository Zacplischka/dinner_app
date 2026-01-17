import { chromium, FullConfig } from '@playwright/test';

/**
 * Global Setup for Playwright E2E Tests
 *
 * This runs once before all tests to:
 * 1. Verify frontend and backend are accessible
 * 2. Check Redis connectivity (if needed)
 * 3. Set up any global test data
 */

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';
  const backendURL = process.env.BACKEND_URL || 'http://localhost:3001';

  console.log('\n🚀 E2E Test Setup Starting...');
  console.log(`   Frontend: ${baseURL}`);
  console.log(`   Backend: ${backendURL}`);

  // Launch a browser to verify the app is running
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Verify frontend is accessible
    console.log('\n📡 Checking frontend...');
    const frontendResponse = await page.goto(baseURL, { timeout: 30_000 });
    if (!frontendResponse?.ok()) {
      throw new Error(`Frontend not accessible at ${baseURL}`);
    }
    console.log('   ✓ Frontend is running');

    // Verify backend health endpoint (if available)
    console.log('📡 Checking backend...');
    try {
      const healthResponse = await page.request.get(`${backendURL}/health`, {
        timeout: 10_000,
      });
      if (healthResponse.ok()) {
        console.log('   ✓ Backend is healthy');
      } else {
        console.log('   ⚠ Backend health check returned non-200');
      }
    } catch (error) {
      console.log('   ⚠ Backend health check unavailable (tests may fail for WebSocket features)');
    }

    // Store any global data for tests
    process.env.E2E_BASE_URL = baseURL;
    process.env.E2E_BACKEND_URL = backendURL;

    console.log('\n✅ E2E Setup Complete\n');
  } catch (error) {
    console.error('\n❌ E2E Setup Failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
