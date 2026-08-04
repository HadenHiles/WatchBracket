import type { Browser, BrowserContextOptions, Page } from '@playwright/test';

export function newAutomationContext(browser: Browser, options: BrowserContextOptions = {}) {
  return browser.newContext({
    ...options,
    extraHTTPHeaders: {
      ...options.extraHTTPHeaders,
      'x-watch-bracket-automation': 'playwright',
    },
  });
}

export async function settleForScreenshot(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      }
      await image.decode().catch(() => undefined);
    }));
  });
  await page.waitForTimeout(900);
}
