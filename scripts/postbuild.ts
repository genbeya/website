/**
 * Runs after `astro build`:
 *  1. Moves the <style> elements of the Mermaid diagrams (rendered at build time) into one
 *     stylesheet, linked from the pages that show diagrams, so no page has inline styles.
 *  2. Hashes the remaining inline <script>s (and <style>s, should any appear) into
 *     dist/_headers' Content-Security-Policy: the policy allows exactly those, nothing else inline.
 *  3. Fails the build when a page or stylesheet would load anything from another origin,
 *     or when a header line is longer than Cloudflare accepts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { log, root, toPosix } from "./lib/cli.ts";

const SCRIPT = "postbuild";
const dist = path.join(root, "dist");
/** The demo is the app's bundle, with its own policy in _headers. */
const EXCLUDED = ["try/app/"];
/** Cloudflare ignores longer lines in _headers. */
const MAX_LINE = 2000;

function files(dir: string, ext: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && ext.includes(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !EXCLUDED.some((prefix) => toPosix(path.relative(dist, file)).startsWith(prefix)));
}

const sha256 = (content: string) => `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;

/** Inline scripts and styles of a page, as the browser sees their text. */
export function inlineBlocks(html: string): { scripts: string[]; styles: string[] } {
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/type=["']?(application\/(ld\+)?json|text\/template)/i.test(attrs ?? ""))
    .map(([, , body]) => body!)
    .filter((body) => body.trim() !== "");
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(([, body]) => body!);
  return { scripts, styles };
}

const RESOURCE_PATTERNS: RegExp[] = [
  /<script\b[^>]*\bsrc=["']?(https?:)?\/\/[^"'\s>]+/gi,
  /<link\b(?=[^>]*\brel=["']?(?:stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|apple-touch-icon|manifest))[^>]*\bhref=["']?(https?:)?\/\/[^"'\s>]+/gi,
  /<(?:img|source|video|audio|iframe|embed|track)\b[^>]*\b(?:src|srcset|poster)=["']?(https?:)?\/\/[^"'\s>]+/gi,
  /<image\b[^>]*\bhref=["']?(https?:)?\/\/[^"'\s>]+/gi,
];

/** Places where a page would fetch something from another origin. */
export function externalResources(html: string): string[] {
  return RESOURCE_PATTERNS.flatMap((pattern) => [...html.matchAll(pattern)].map((match) => match[0]));
}

/** `url(…)` and `@import` in CSS that point at another origin. */
export function externalCss(css: string): string[] {
  return [...css.matchAll(/(?:url\(\s*["']?|@import\s+["'])((?:https?:)?\/\/[^"')\s]+)/gi)]
    .map((match) => match[1]!)
    .filter((url) => !url.startsWith("http://www.w3.org/"));
}

const STYLE_IN_SVG = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** Moves the diagrams' <style> elements into dist/_astro/diagrams.<hash>.css. */
function extractDiagramStyles(pages: string[]): number {
  const css = new Set<string>();
  const affected: string[] = [];
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    if (!html.includes("gb-diagram")) continue;
    let found = false;
    for (const [, body] of html.matchAll(STYLE_IN_SVG)) {
      css.add(decodeEntities(body!).trim());
      found = true;
    }
    if (found) affected.push(file);
  }
  if (css.size === 0) return 0;

  const content = [...css].join("\n");
  const name = `diagrams.${createHash("sha256").update(content).digest("hex").slice(0, 10)}.css`;
  mkdirSync(path.join(dist, "_astro"), { recursive: true });
  writeFileSync(path.join(dist, "_astro", name), content + "\n");
  for (const file of affected) {
    const html = readFileSync(file, "utf8")
      .replace(STYLE_IN_SVG, "")
      .replace("</head>", `<link rel="stylesheet" href="/_astro/${name}"></head>`);
    writeFileSync(file, html);
  }
  return affected.length;
}

function main(): void {
  const pages = files(dist, [".html"]);
  const withDiagrams = extractDiagramStyles(pages);

  const scriptHashes = new Set<string>();
  const styleHashes = new Set<string>();
  const problems: string[] = [];

  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    const { scripts, styles } = inlineBlocks(html);
    scripts.forEach((body) => scriptHashes.add(sha256(body)));
    styles.forEach((body) => styleHashes.add(sha256(body)));
    for (const found of externalResources(html)) problems.push(`${toPosix(path.relative(dist, file))}: ${found}`);
  }
  for (const file of files(dist, [".css"])) {
    for (const url of externalCss(readFileSync(file, "utf8")))
      problems.push(`${toPosix(path.relative(dist, file))}: ${url}`);
  }
  if (problems.length > 0) {
    throw new Error(`The site would load from other origins:\n  ${problems.join("\n  ")}`);
  }

  const headersFile = path.join(dist, "_headers");
  const headers = readFileSync(headersFile, "utf8")
    .replace("{{SCRIPT_HASHES}}", [...scriptHashes].sort().join(" "))
    .replace("{{STYLE_HASHES}}", [...styleHashes].sort().join(" "))
    .replace(/ +;/g, ";");
  const long = headers.split("\n").filter((line) => line.length > MAX_LINE);
  if (long.length > 0) {
    throw new Error(`_headers has lines over ${MAX_LINE} characters, which Cloudflare ignores:\n${long.join("\n")}`);
  }
  writeFileSync(headersFile, headers);
  log(
    SCRIPT,
    `${pages.length} pages (${withDiagrams} with diagrams): CSP allows ${scriptHashes.size} inline scripts and ` +
      `${styleHashes.size} inline styles; no third-party resources.`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(`[${SCRIPT}] ${(error as Error).message}`);
    process.exit(1);
  }
}
