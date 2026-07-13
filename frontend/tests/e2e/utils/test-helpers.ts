import { Page } from '@playwright/test';

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

  return {
    passed: issues.length === 0,
    issues,
  };
}
