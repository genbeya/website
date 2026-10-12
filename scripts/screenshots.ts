/**
 * npm run screenshots [-- --out .cache/screenshots] [--no-video]
 *
 * Takes screenshots of the built site (npm run build first) for design reviews: the home page
 * at each chapter of its story and at each section, the docs, try and download pages, on a
 * desktop (1440 × 900) and a phone (375 × 812), dark and light; and records a video of the
 * story scrolling by. Serves dist/ itself, with its headers.
 */
import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { log, option, parseArgs, root } from "./lib/cli.ts";
import { serve } from "./serve.ts";

const SCRIPT = "screenshots";
const args = parseArgs();
const out = path.resolve(root, option(args, "out", "SCREENSHOTS_DIR") ?? ".cache/screenshots");
const port = 4610;
const base = `http://localhost:${port}`;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
} as const;
type Viewport = keyof typeof VIEWPORTS;
type Theme = "dark" | "light";

const SECTIONS = ["#features", "#how-it-works", "#why-genbeya", "#vision", ".cta", ".site-footer"];
const PAGES = [
  { name: "docs-home", path: "/docs/" },
  { name: "docs-references", path: "/docs/guide/references/" },
  { name: "docs-wiki", path: "/docs/guide/wiki/" },
  { name: "try", path: "/try/" },
  { name: "download", path: "/download/" },
];

async function open(browser: Browser, viewport: Viewport, theme: Theme, reducedMotion = false): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: viewport === "mobile" ? 2 : 1,
    colorScheme: theme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    isMobile: viewport === "mobile",
    hasTouch: viewport === "mobile",
  });
  return context.newPage();
}

async function storyPosition(page: Page, step: number): Promise<number> {
  return page.evaluate((index) => {
    const story = document.querySelector<HTMLElement>("[data-story]")!;
    const steps = Number(getComputedStyle(story).getPropertyValue("--steps"));
    const distance = story.offsetHeight - window.innerHeight;
    return Math.round(story.offsetTop + ((index + 0.3) / steps) * distance);
  }, step);
}

async function settle(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForTimeout(1300);
}

async function shootHome(browser: Browser, viewport: Viewport, theme: Theme): Promise<void> {
  const page = await open(browser, viewport, theme);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2600); // the intro
  const prefix = path.join(out, `home-${viewport}-${theme}`);
  await page.screenshot({ path: `${prefix}-0-hero.png` });
  for (let step = 1; step <= 6; step++) {
    await settle(page, await storyPosition(page, step));
    await page.screenshot({ path: `${prefix}-${step}-chapter.png` });
  }
  for (const [i, selector] of SECTIONS.entries()) {
    const y = await page.evaluate(
      (s) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect().top + window.scrollY - 64,
      selector,
    );
    await settle(page, y);
    await page.screenshot({ path: `${prefix}-${7 + i}-${selector.replace(/[#.]/g, "")}.png` });
  }
  await page.context().close();
}

async function shootPages(browser: Browser, viewport: Viewport, theme: Theme): Promise<void> {
  const page = await open(browser, viewport, theme);
  for (const { name, path: url } of PAGES) {
    await page.goto(`${base}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${name}-${viewport}-${theme}.png`) });
  }
  await page.context().close();
}

async function shootReducedMotion(browser: Browser): Promise<void> {
  const page = await open(browser, "desktop", "dark", true);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(out, "home-desktop-dark-reduced-motion-full.png"), fullPage: true });
  await page.context().close();
}

/** Scrolls through the story like a reader would, and records it. */
async function recordStory(browser: Browser): Promise<void> {
  const videoDir = path.join(out, "video");
  const context = await browser.newContext({
    viewport: VIEWPORTS.desktop,
    colorScheme: "dark",
    recordVideo: { dir: videoDir, size: VIEWPORTS.desktop },
  });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const end = await storyPosition(page, 6.5);
  await page.mouse.move(700, 450);
  for (let y = 0; y < end; y += 36) {
    await page.mouse.wheel(0, 36);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(1500);
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), path.join(out, "home-story-desktop-dark.webm"));
}

mkdirSync(out, { recursive: true });
const server = serve(path.join(root, "dist"), port);
const browser = await chromium.launch();
try {
  for (const viewport of Object.keys(VIEWPORTS) as Viewport[]) {
    for (const theme of ["dark", "light"] as Theme[]) {
      await shootHome(browser, viewport, theme);
      await shootPages(browser, viewport, theme);
    }
  }
  await shootReducedMotion(browser);
  if (!args.has("no-video")) await recordStory(browser);
  log(SCRIPT, `Saved to ${out}`);
} finally {
  await browser.close();
  server.close();
}
