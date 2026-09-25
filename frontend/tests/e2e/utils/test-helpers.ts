import type { BrowserContext, Page } from '@playwright/test';

/**
 * Bridge the page's Socket.IO WebSocket to a fixture server at `origin`. The app
 * connects over WebSocket only (#518), which HTTP routes never see, and
 * connectToServer() can only reach the URL the page asked for.
 */
export async function routeSocketIo(target: Page | BrowserContext, origin: string) {
  await target.routeWebSocket('**/socket.io/**', (page) => {
    const url = new URL(page.url());
    const server = new WebSocket(`${origin.replace(/^http/, 'ws')}${url.pathname}${url.search}`);
    server.binaryType = 'arraybuffer';
    // Engine.IO's client speaks only after the server's open packet, so the
    // upstream socket is always open by the time the page sends.
    server.onmessage = ({ data }) => page.send(typeof data === 'string' ? data : Buffer.from(data));
    server.onclose = () => void page.close().catch(() => undefined);
    page.onMessage((message) => server.send(message));
    page.onClose(() => server.close());
  });
}

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
