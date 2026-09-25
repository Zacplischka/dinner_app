import type { BrowserContext, Page } from '@playwright/test';

/**
 * Send the page's Socket.IO traffic to a fixture server at `origin`. The app
 * polls first, then upgrades (#518): HTTP routes carry the polling, and the
 * WebSocket upgrade, which HTTP routes never see, is bridged by hand because
 * connectToServer() can only reach the URL the page asked for.
 */
export async function routeSocketIo(target: Page | BrowserContext, origin: string) {
  await target.route('**/socket.io/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${origin}${url.pathname}${url.search}`,
      timeout: 0,
    });
    await route.fulfill({ response });
  });
  await target.routeWebSocket('**/socket.io/**', (page) => {
    const url = new URL(page.url());
    const server = new WebSocket(`${origin.replace(/^http/, 'ws')}${url.pathname}${url.search}`);
    server.binaryType = 'arraybuffer';
    // The page's side opens at once and sends its upgrade probe straight away,
    // so hold its messages until the fixture's side is open.
    const pending: (string | Buffer)[] = [];
    server.onopen = () => pending.splice(0).forEach((message) => server.send(message));
    server.onmessage = ({ data }) => page.send(typeof data === 'string' ? data : Buffer.from(data));
    server.onclose = () => void page.close().catch(() => undefined);
    page.onMessage((message) =>
      server.readyState === WebSocket.OPEN ? server.send(message) : pending.push(message)
    );
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
