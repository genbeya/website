/**
 * Plan blocks (`[EFFORT]`, `[DEPENDENCIES]`, `[GANTT]`, `[ARROWS]`, `[FLOAT]`) drawn as the app
 * draws them, at sync time: the app's `src/shells/docs/plans.ts` (Genbeya 0.2.1 and newer) is
 * bundled from the checked-out release with Vite and run on its task files and `.genbeya.yml`.
 * The nodes go into the docs index; the Markdown pipeline puts them in place of the blocks. A
 * release without the module, or a failure here, leaves the blocks to the pipeline's note.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "./cli.ts";

/** The app's entry for drawing plans outside the app, from the repository root. */
export const PLANS_MODULE = "src/shells/docs/plans.ts";

/** A plan block the app can draw from files; plans over time need the Git history and stay a note. */
const DRAWABLE = /^\[(EFFORT|DEPENDENCIES|GANTT|ARROWS|FLOAT)(?:[ \t][^\]\n]*)?\]$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

interface RepositoryFile {
  readonly path: string;
  readonly content: string;
}

interface DocsPlans {
  readonly tasks: number;
  draw(block: string): unknown[] | null;
}

type DocsPlansOf = (settingsText: string | null, taskFiles: readonly RepositoryFile[], today: string) => DocsPlans;

/** The plan blocks of a page, each a paragraph of its own and outside code: what the pipeline will look up. */
export function findPlanBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const found: string[] = [];
  let fence: string | null = null;
  for (const [i, line] of lines.entries()) {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    const text = line.trim();
    const alone = !lines[i - 1]?.trim() && !lines[i + 1]?.trim();
    if (alone && DRAWABLE.test(text) && !found.includes(text)) found.push(text);
  }
  return found;
}

/** Markdown files below `folder`, as paths from `repo`. */
function taskFiles(repo: string, folder: string): RepositoryFile[] {
  const files: RepositoryFile[] = [];
  const walk = (relative: string) => {
    const absolute = path.join(repo, relative);
    if (!existsSync(absolute)) return;
    for (const name of readdirSync(absolute)) {
      const child = path.posix.join(relative, name);
      if (statSync(path.join(repo, child)).isDirectory()) walk(child);
      else if (name.endsWith(".md")) files.push({ path: child, content: readFileSync(path.join(repo, child), "utf8") });
    }
  };
  walk(folder);
  return files;
}

/** The app's `docsPlans`, bundled from `repo` with Vite; null when the release has none. */
async function loadDocsPlans(repo: string): Promise<DocsPlansOf | null> {
  const entry = path.join(repo, PLANS_MODULE);
  if (!existsSync(entry)) return null;
  const outDir = path.join(root, ".cache", "docs-plans");
  rmSync(outDir, { recursive: true, force: true });
  const { build } = await import("vite");
  await build({
    configFile: false,
    root: repo,
    logLevel: "warn",
    publicDir: false,
    // Everything in one file, so the bundle needs nothing from the checkout, which has no node_modules.
    ssr: { noExternal: true },
    build: {
      ssr: entry,
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { output: { format: "es", entryFileNames: "plans.mjs" } },
    },
  });
  const module = (await import(pathToFileURL(path.join(outDir, "plans.mjs")).href)) as { docsPlans?: DocsPlansOf };
  return typeof module.docsPlans === "function" ? module.docsPlans : null;
}

export interface DrawnPlans {
  /** The nodes each block becomes, by the block's text. */
  readonly plans: Record<string, unknown[]>;
  readonly tasks: number;
}

/**
 * Draws the plan blocks of `sources` from the repository at `repo`, as of `today` (`YYYY-MM-DD`).
 * Null when the release can't draw them; blocks it can't draw are left out.
 */
export async function drawPlans(
  repo: string,
  settingsText: string | null,
  taskRoot: string,
  sources: readonly string[],
  today: string,
): Promise<DrawnPlans | null> {
  const blocks = [...new Set(sources.flatMap(findPlanBlocks))];
  if (!blocks.length) return { plans: {}, tasks: 0 };
  const docsPlans = await loadDocsPlans(repo);
  if (!docsPlans) return null;
  const drawer = docsPlans(settingsText, taskFiles(repo, taskRoot), today);
  const plans: Record<string, unknown[]> = {};
  for (const block of blocks) {
    const nodes = drawer.draw(block);
    if (nodes) plans[block] = nodes;
  }
  return { plans, tasks: drawer.tasks };
}
