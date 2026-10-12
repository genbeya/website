import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const UA = {
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
};

/**
 * Pretends to be another browser: the user agent string, plus the Client Hints that Chromium
 * would otherwise give away (`null` hides them, as Safari and Firefox do).
 */
async function as(page: Page, userAgent: string, hints: { platform: string; architecture: string } | null) {
  await page.addInitScript(
    ({ userAgent, hints }) => {
      Object.defineProperty(navigator, "userAgent", { get: () => userAgent });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => (/iPhone/.test(userAgent) ? 5 : 0) });
      Object.defineProperty(navigator, "userAgentData", {
        get: () =>
          hints && {
            platform: hints.platform,
            mobile: false,
            getHighEntropyValues: async () => ({ architecture: hints.architecture, bitness: "64" }),
          },
      });
    },
    { userAgent, hints },
  );
}

const visibleDownload = (page: Page) => page.locator("[data-pick-for]:visible [data-download]");

test.describe("download page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/download/");
    test.skip((await page.locator("[data-soon]").count()) > 0, "No release yet: the page says it is coming soon.");
  });

  test("offers Windows the Electron installer", async ({ page }) => {
    await as(page, UA.windows, { platform: "Windows", architecture: "x86" });
    await page.reload();
    await expect(visibleDownload(page)).toHaveAttribute(
      "href",
      /\/releases\/download\/v[^/]+\/Genbeya-[^/]+-electron-windows-x64-setup\.exe$/,
    );
    await expect(page.locator('tbody[data-os="windows"] [data-yours]')).toBeVisible();
  });

  test("offers Macs Apple silicon by default, with a link for Intel", async ({ page }) => {
    await as(page, UA.macSafari, null);
    await page.reload();
    await expect(visibleDownload(page)).toHaveAttribute("href", /-electron-macos-arm64\.dmg$/);
    await expect(page.locator("[data-pick-for]:visible [data-other-arch]")).toHaveAttribute(
      "href",
      /-electron-macos-x64\.dmg$/,
    );
    await expect(page.locator("[data-pick-for]:visible [data-other-arch]")).toHaveText(/Intel Mac\?/);
  });

  test("offers Intel Macs the Intel build when Chromium says so", async ({ page }) => {
    await as(page, UA.macSafari, { platform: "macOS", architecture: "x86" });
    await page.reload();
    await expect(visibleDownload(page)).toHaveAttribute("href", /-electron-macos-x64\.dmg$/);
  });

  test("offers Linux the AppImage", async ({ page }) => {
    await as(page, UA.linux, null);
    await page.reload();
    await expect(visibleDownload(page)).toHaveAttribute("href", /-electron-linux-x64\.AppImage$/);
  });

  test("tells phones that Genbeya is a desktop app", async ({ page }) => {
    await as(page, UA.iphone, null);
    await page.reload();
    await expect(page.locator('[data-pick-for="mobile"]')).toBeVisible();
    await expect(
      page.locator('[data-pick-for="mobile"]').getByRole("link", { name: "Try it in your browser" }),
    ).toBeVisible();
  });

  test("lists every installer with a link to the release", async ({ page }) => {
    const rows = page.locator("tr[data-installer]");
    expect(await rows.count()).toBeGreaterThanOrEqual(3);
    for (const link of await page.locator("tr[data-installer] a").all()) {
      await expect(link).toHaveAttribute("href", /^https:\/\/github\.com\/genbeya\/genbeya\/releases\/download\//);
    }
  });
});
