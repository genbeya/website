/**
 * npm run sync-demo [-- --source <dir> | --zip <file> | --placeholder] [--if-missing]
 *
 * Puts the browser demo of Genbeya (the static bundle the app's release ships as
 * genbeya-web-demo.zip) at public/try/app/, where /try/ starts it. Sources, first match wins:
 *   --zip / GENBEYA_DEMO_ZIP        a downloaded genbeya-web-demo.zip (CI)
 *   --source / GENBEYA_DEMO_DIR     a built bundle (default ../genbeya-demo/dist/demo/browser)
 *   otherwise, or with --placeholder, a page that says the demo isn't part of this build.
 * --if-missing does nothing when public/try/app/ already holds a demo or a placeholder.
 * Writes src/generated/demo.json ({ available, source }) for the /try/ page.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generatedDir, log, option, parseArgs, root } from "./lib/cli.ts";

const SCRIPT = "sync-demo";
export const target = path.join(root, "public", "try", "app");
const BASE = "/try/app/";

/** The shallowest folder below `dir` that holds an index.html. */
function findBundle(dir: string, depth = 0): string | undefined {
  if (existsSync(path.join(dir, "index.html"))) return dir;
  if (depth > 3) return undefined;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "__MACOSX") continue;
    const found = findBundle(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return undefined;
}

function extract(zip: string): string {
  const dir = path.join(root, ".cache", "demo-extract");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync("unzip", ["-q", "-o", zip, "-d", dir], { stdio: "inherit" });
  } catch {
    // Windows' tar (bsdtar) reads zip files too.
    execFileSync("tar", ["-xf", zip, "-C", dir], { stdio: "inherit" });
  }
  return dir;
}

/** The demo is served below /try/app/; an absolute <base href="/"> would load its files from the root. */
export function rebase(html: string): string {
  return html.replace(/<base\s+href=["']\/["']\s*\/?>/i, `<base href="${BASE}">`);
}

function install(bundle: string, source: string): void {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(bundle, target, { recursive: true });
  const index = path.join(target, "index.html");
  writeFileSync(index, rebase(readFileSync(index, "utf8")));
  writeStatus(true, source);
  log(SCRIPT, `Installed the demo from ${source} at public/try/app/.`);
}

function writeStatus(available: boolean, source: string): void {
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(path.join(generatedDir, "demo.json"), JSON.stringify({ available, source }, null, 2) + "\n");
}

function writePlaceholder(reason: string): void {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(path.join(root, "scripts", "demo-placeholder"), target, { recursive: true });
  writeStatus(false, "placeholder");
  log(SCRIPT, `Wrote a placeholder at public/try/app/ (${reason}).`);
}

export function syncDemo(args = parseArgs()): void {
  if (
    args.has("if-missing") &&
    existsSync(path.join(target, "index.html")) &&
    existsSync(path.join(generatedDir, "demo.json"))
  ) {
    return;
  }
  if (args.has("placeholder")) return writePlaceholder("asked for");

  const zip = option(args, "zip", "GENBEYA_DEMO_ZIP");
  if (zip) {
    const file = path.resolve(root, zip);
    if (!existsSync(file)) return writePlaceholder(`${zip} does not exist`);
    const bundle = findBundle(extract(file));
    if (!bundle) throw new Error(`${zip} holds no index.html.`);
    return install(bundle, path.basename(file));
  }

  const source = path.resolve(root, option(args, "source", "GENBEYA_DEMO_DIR") ?? "../genbeya-demo/dist/demo/browser");
  if (existsSync(source) && statSync(source).isDirectory()) {
    const bundle = findBundle(source);
    if (bundle) return install(bundle, path.relative(root, bundle) || ".");
  }
  writePlaceholder(`no demo bundle at ${path.relative(root, source)}`);
}

if (import.meta.main) {
  try {
    syncDemo();
  } catch (error) {
    console.error(`[${SCRIPT}] ${(error as Error).message}`);
    process.exit(1);
  }
}
