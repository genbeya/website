/**
 * npm run brand-images [-- --logo ../genbeya/branding/genbeya.svg]
 *
 * Renders the social card (public/og.png, 1200 × 630) and the Apple touch icon
 * (public/apple-touch-icon.png, 180 × 180) from the logo, in a headless Chromium.
 * The results are committed; run this again when the logo or the pitch changes.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright";
import { log, option, parseArgs, root } from "./lib/cli.ts";

const require = createRequire(import.meta.url);
const args = parseArgs();
const logoFile = path.resolve(root, option(args, "logo", "GENBEYA_LOGO") ?? "../genbeya/branding/genbeya.svg");
const logo = readFileSync(logoFile, "utf8").replace(/<title>.*?<\/title>/, "");
// A data URL: the page is about:blank, which may not load file: URLs.
const font = `data:font/woff2;base64,${readFileSync(require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).toString("base64")}`;

const card = `<!doctype html><html><head><style>
  @font-face { font-family: Inter; src: url("${font}") format("woff2"); font-weight: 100 900; }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    display: grid; grid-template-columns: 1fr 420px; align-items: center; gap: 40px;
    padding: 0 90px; box-sizing: border-box; font-family: Inter, sans-serif; color: #ececf0;
    background:
      radial-gradient(520px 420px at 82% 50%, rgb(124 127 242 / 0.42), transparent 70%),
      linear-gradient(rgb(255 255 255 / 0.04) 1px, transparent 1px) 0 0 / 56px 56px,
      linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px) 0 0 / 56px 56px,
      #0b0c0e;
  }
  .name { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; letter-spacing: -0.02em; color: #aeb0ff; }
  h1 { margin: 22px 0 0; font-size: 64px; line-height: 1.04; letter-spacing: -0.045em; font-weight: 700; }
  h1 span { color: #aeb0ff; }
  p { margin: 26px 0 0; font-size: 25px; line-height: 1.45; color: #a7a8b1; }
  .url { margin-top: 34px; font-size: 21px; color: #75767f; letter-spacing: 0.02em; }
  svg { width: 420px; height: 420px; filter: drop-shadow(0 0 0.6px rgb(255 255 255 / 0.6)) drop-shadow(0 0 22px rgb(124 127 242 / 0.5)); }
</style></head><body>
  <div>
    <div class="name">Genbeya</div>
    <h1>Your whole project,<br><span>in the repository.</span></h1>
    <p>Docs, tasks, decisions and code — as plain files you can version, review and use anywhere.</p>
    <div class="url">genbeya.fyi</div>
  </div>
  ${logo}
</body></html>`;

const icon = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 180px; height: 180px; background: #ffffff; }
  body { display: grid; place-items: center; }
  svg { width: 150px; height: 150px; }
</style></head><body>${logo}</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(card, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, "public", "og.png") });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(icon, { waitUntil: "load" });
  await page.screenshot({ path: path.join(root, "public", "apple-touch-icon.png") });
  log("brand-images", "Wrote public/og.png and public/apple-touch-icon.png.");
} finally {
  await browser.close();
}
