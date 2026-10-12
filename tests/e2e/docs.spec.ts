import { expect, test } from "./fixtures";

test.describe("documentation", () => {
  test("renders references to pages, tasks and files", async ({ page, watch }) => {
    await page.goto("/docs/guide/references/");
    test.skip(
      (await page.locator(".gb-ref").count()) === 0,
      "The docs were not synced from the app repository (placeholder build).",
    );
    await expect(page.getByRole("heading", { level: 1, name: "References" })).toBeVisible();

    const task = page.locator("a.gb-ref--task").first();
    await expect(task).toHaveAttribute(
      "href",
      /^https:\/\/github\.com\/genbeya\/genbeya\/blob\/[^/]+\/tasks\/.*GENBEYA-\d+\.md$/,
    );
    await expect(task.locator(".gb-ref__status")).not.toBeEmpty();

    const pageRef = page.locator("a.gb-ref--page").first();
    await expect(pageRef).toHaveAttribute("href", /^\/docs\//);
    await pageRef.click();
    await expect(page).toHaveURL(/\/docs\/.+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(watch.errors).toEqual([]);
  });

  test("links lines of files to GitHub and embeds them", async ({ page }) => {
    await page.goto("/docs/guide/references/");
    test.skip((await page.locator(".gb-ref").count()) === 0, "Placeholder build.");
    await expect(page.locator("a.gb-ref--file:has(.gb-ref__lines)").first()).toHaveAttribute(
      "href",
      /\/blob\/[^/]+\/.+#L\d+(-L\d+)?$/,
    );
    await expect(page.locator(".expressive-code").filter({ hasText: ".genbeya.yml" }).first()).toBeVisible();
    await expect(page.getByText("[TOC]")).toHaveCount(0);
  });

  test("shares the site's header and has a working sidebar", async ({ page }) => {
    await page.goto("/docs/");
    const header = page.locator("header.header");
    await expect(header.getByRole("link", { name: "Genbeya home" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "page");
    await expect(header.getByRole("link", { name: "Download" })).toBeVisible();
    await expect(page.locator("#starlight__sidebar")).toBeVisible();
  });

  test("searches with Pagefind, within the CSP", async ({ page, watch }) => {
    await page.goto("/docs/");
    test.skip((await page.locator(".gb-ref, a[href^='/docs/guide']").count()) === 0, "Placeholder build.");
    await page.getByRole("button", { name: "Search the docs" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("references");
    await expect(page.locator(".pagefind-ui__result").first()).toBeVisible({ timeout: 10_000 });
    expect(watch.errors).toEqual([]);
  });
});
