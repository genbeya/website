import type { Page } from "@playwright/test";
import { expect, scrollTo, test } from "./fixtures";

/** The scroll position where a chapter's text is fully shown (the middle of its hold). */
async function chapterPosition(page: Page, step: number): Promise<number> {
  return page.evaluate((index) => {
    const story = document.querySelector<HTMLElement>("[data-story]")!;
    const steps = Number(getComputedStyle(story).getPropertyValue("--steps"));
    const start = story.getBoundingClientRect().top + window.scrollY;
    const distance = story.offsetHeight - window.innerHeight;
    return Math.round(start + ((index + 0.3) / steps) * distance);
  }, step);
}

test.describe("home page", () => {
  test("renders the hero, the logo and the sections", async ({ page, watch }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Your whole project,\s*in the repository\./);
    await expect(page.getByRole("img", { name: /Genbeya's logo/ })).toBeVisible();
    await expect(page.locator("[data-layer]")).toHaveCount(5);
    for (const name of [
      "Everything a project needs, in one window",
      "It's your repository. Genbeya just furnishes the room.",
      "The big room, at the real place",
      "One repository, many frontends, no lock-in",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeAttached();
    }
    expect(watch.errors).toEqual([]);
  });

  test("the scroll story advances through its chapters", async ({ page, watch }) => {
    await page.goto("/");
    const story = page.locator("[data-story]");
    await expect(story).toHaveClass(/is-live/);
    await expect(story).toHaveCSS("position", "relative");
    await expect(page.locator(".story__stage")).toHaveCSS("position", "sticky");
    await expect(story).toHaveAttribute("data-chapter", "0");

    const chapters = await page.locator(".chapter").count();
    expect(chapters).toBe(6);
    for (let step = 1; step <= chapters; step++) {
      await scrollTo(page, await chapterPosition(page, step));
      await expect(story).toHaveAttribute("data-chapter", String(step));
      const chapter = page.locator(`.chapter[data-chapter-index="${step}"]`);
      await expect(chapter).toBeVisible();
      await expect(chapter).toHaveCSS("opacity", "1", { timeout: 4000 });
      await expect(page.locator(`[data-rail="${step}"]`)).toHaveAttribute("aria-current", "step");
    }

    // Each chapter brings its part of the logo forward and dims the others.
    await scrollTo(page, await chapterPosition(page, 2));
    await expect(page.locator('[data-layer="wiki"]')).toHaveCSS("opacity", "1", { timeout: 4000 });
    await expect
      .poll(() => page.locator('[data-layer="tasks"]').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeLessThan(0.5);

    // And back to the start: the logo is whole again.
    await scrollTo(page, 0);
    await expect(story).toHaveAttribute("data-chapter", "0");
    await expect(page.locator("[data-hero]")).toHaveCSS("opacity", "1", { timeout: 4000 });
    expect(watch.errors).toEqual([]);
  });

  test("the chapter rail jumps to a chapter", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-rail="4"]').click();
    await expect(page.locator("[data-story]")).toHaveAttribute("data-chapter", "4", { timeout: 5000 });
  });

  test("keyboard focus brings hidden chapter links into view", async ({ page }) => {
    await page.goto("/");
    await page.locator(".chapter[data-chapter-index='6'] a").first().focus();
    await expect(page.locator("[data-story]")).toHaveAttribute("data-chapter", "6");
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("shows a still story: no pinning, no scrubbing, every chapter readable", async ({ page, watch }) => {
      await page.goto("/");
      await expect(page.locator(".story__stage")).toHaveCSS("position", "relative");
      await expect(page.locator(".story__rail")).toBeHidden();
      const chapters = page.locator(".chapter");
      await expect(chapters).toHaveCount(6);
      for (const chapter of await chapters.all()) {
        await chapter.scrollIntoViewIfNeeded();
        await expect(chapter).toBeVisible();
        await expect(chapter).toHaveCSS("opacity", "1");
        await expect(chapter.locator(".chapter__figure")).toBeVisible();
      }
      await expect(page.locator("[data-story]")).toHaveAttribute("data-chapter", "0");
      // The logo is whole and still.
      for (const part of ["wiki", "tasks", "history", "team"]) {
        await expect(page.locator(`[data-layer="${part}"]`)).toHaveCSS("opacity", "1");
      }
      expect(watch.errors).toEqual([]);
    });
  });

  test("fits a phone's width @phone", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await scrollTo(page, await chapterPosition(page, 3));
    await expect(page.locator("[data-story]")).toHaveAttribute("data-chapter", "3");
    await expect(page.locator(".chapter[data-chapter-index='3'] h2")).toBeInViewport();
  });
});
