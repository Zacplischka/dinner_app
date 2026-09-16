import { Page } from '@playwright/test';

/**
 * Check for common accessibility issues: images without alt text, buttons
 * without an accessible name, and inputs with an id but no label.
 */
export function checkAccessibility(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];

    const imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
    if (imagesWithoutAlt > 0) issues.push(`${imagesWithoutAlt} images missing alt text`);

    for (const button of document.querySelectorAll('button, [role="button"]')) {
      if (!(button.getAttribute('aria-label') || button.textContent)?.trim()) {
        issues.push('Button without accessible name found');
      }
    }

    for (const input of document.querySelectorAll('input:not([type="hidden"])')) {
      const labelled =
        input.getAttribute('aria-label') ||
        input.getAttribute('aria-labelledby') ||
        document.querySelector(`label[for="${input.id}"]`);
      if (input.id && !labelled) issues.push(`Input "${input.id}" missing label`);
    }

    return issues;
  });
}
