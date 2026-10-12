import { expect, scrollTo, storedState, test } from "./fixtures";

const PAGES = ["/", "/docs/", "/docs/guide/references/", "/docs/guide/wiki/", "/try/", "/download/", "/no-such-page/"];

test.describe("privacy", () => {
  test("the notice closes, and comes back after a reload @mobile", async ({ page }) => {
    await page.goto("/");
    const notice = page.getByRole("complementary", { name: "Privacy" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("We don't use cookies, don't track you and don't sell your data.");
    await notice.getByRole("button", { name: "Thank you" }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(notice).toBeVisible();
  });

  test("the notice works with the keyboard", async ({ page }) => {
    await page.goto("/try/");
    const button = page.getByRole("button", { name: "Thank you" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("complementary", { name: "Privacy" })).toBeHidden();
  });

  test("the notice doesn't cover the end of the page on a phone @phone", async ({ page }) => {
    await page.goto("/download/");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const notice = await page.getByRole("complementary", { name: "Privacy" }).boundingBox();
    const legal = await page.locator(".site-footer__legal").boundingBox();
    expect(notice && legal).toBeTruthy();
    expect(legal!.y + legal!.height).toBeLessThanOrEqual(notice!.y + 1);
  });

  test("no page requests anything from another origin", async ({ page, watch }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    // The home page's story, all the way down.
    await page.goto("/");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 600) await scrollTo(page, y);
    await page.waitForLoadState("networkidle");
    expect(watch.foreignRequests).toEqual([]);
  });

  test("no page breaks its Content-Security-Policy or logs errors", async ({ page, watch }) => {
    for (const path of PAGES.filter((p) => p !== "/no-such-page/")) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(watch.errors).toEqual([]);
  });

  test("nothing is stored in the browser, whatever the visitor does", async ({ page, context }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Switch to the (light|dark) theme/ }).click();
    await page.getByRole("button", { name: "Thank you" }).click();
    await scrollTo(page, 2500);
    await page.getByRole("link", { name: "Docs" }).first().click();
    await page.waitForURL("**/docs/");
    await page.locator("#starlight__sidebar summary").first().click();
    await page
      .getByRole("button", { name: /Switch to the (light|dark) theme/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Search the docs" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("tasks");
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Download", exact: true }).first().click();
    await page.waitForURL("**/download/");
    // Leaving a page is when Starlight would have saved the sidebar.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.goto("/try/");

    expect(await storedState(page)).toEqual({ localStorage: 0, sessionStorage: 0, cookie: "", indexedDB: 0 });
    expect(await context.cookies()).toEqual([]);
  });

  test("the theme toggle works and is not remembered", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Switch to the light theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("serves the security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(/default-src 'none'/);
    expect(headers["content-security-policy"]).not.toContain("{{");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});

test.describe("accessibility basics", () => {
  test("a skip link leads to the content, and focus is visible", async ({ page }) => {
    await page.goto("/download/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("the mobile menu opens and lists every section @phone", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("navigation", { name: "Main menu" });
    await expect(menu).toBeVisible();
    for (const name of ["Home", "Docs", "Try it", "Download", "GitHub"]) {
      await expect(menu.getByRole("link", { name })).toBeVisible();
    }
  });
});
