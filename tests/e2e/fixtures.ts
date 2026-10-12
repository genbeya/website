import { test as base, expect, type Page } from "@playwright/test";

interface Watch {
  /** Requests the page made to any other origin. */
  foreignRequests: string[];
  /** Console errors and uncaught exceptions, CSP violations included. */
  errors: string[];
}

/**
 * Every test watches its page: requests to other origins are recorded and aborted (the site
 * must make none), and console errors are collected.
 */
export const test = base.extend<{ watch: Watch }>({
  watch: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const watch: Watch = { foreignRequests: [], errors: [] };
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url.startsWith("blob:") || new URL(url).origin === origin) return route.continue();
      watch.foreignRequests.push(url);
      return route.abort();
    });
    page.on("console", (message) => {
      if (message.type() === "error") watch.errors.push(message.text());
    });
    page.on("pageerror", (error) => watch.errors.push(String(error)));
    await use(watch);
  },
});

export { expect };

/** Scrolls the page to `y` and lets ScrollTrigger catch up. */
export async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForTimeout(150);
}

/** What the browser keeps for this site: it must stay empty. */
export async function storedState(page: Page) {
  return page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    cookie: document.cookie,
    indexedDB: "databases" in indexedDB ? (await indexedDB.databases()).length : 0,
  }));
}
