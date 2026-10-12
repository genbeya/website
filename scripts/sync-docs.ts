/**
 * npm run sync-docs [-- --repo ../genbeya] [--docs <wiki folder>] [--ref v1.2.3] [--placeholder]
 *
 * Copies the app repository's wiki (its user documentation) into src/content/docs/docs/,
 * gives every page the front matter Starlight needs, and writes src/generated/docs-index.json
 * (pages, tasks, the files that references name, the contents of embedded files) and
 * src/generated/sidebar.json. The Markdown pipeline renders references from that index.
 *
 * Sources, first match wins: --repo / GENBEYA_REPO (default ../genbeya), --docs / GENBEYA_DOCS
 * (default <repo>/<wikiRoot>), --ref / GENBEYA_REF (default: the tag at the repository's HEAD,
 * else "main"), --url / GENBEYA_REPO_URL (default https://github.com/genbeya/genbeya).
 * --placeholder writes a single page that explains how to sync, for builds without the app.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  emptyIndex,
  slugOfPage,
  titleFromFileName,
  type DocsFile,
  type DocsIndex,
  type DocsPage,
  type DocsTask,
} from "../src/markdown/docs-index.ts";
import { parseReference, resolveReference } from "../src/markdown/references.ts";
import { generatedDir, log, option, parseArgs, root, toPosix } from "./lib/cli.ts";

const SCRIPT = "sync-docs";
const DEFAULT_URL = "https://github.com/genbeya/genbeya";
const DEFAULT_STATUSES = ["backlog", "todo", "in-progress", "review", "done"];
/** Pages that come first in the sidebar, after the home page; the rest follow by title. */
const PREFERRED_ORDER = ["getting started", "guide"];
/** Pages that come last: the ones for contributors. */
const LAST = ["architecture", "development"];
const MAX_EMBED_BYTES = 1_000_000;

export const outDir = path.join(root, "src", "content", "docs", "docs");

interface Settings {
  wikiRoot?: string;
  wikiHome?: string;
  taskRoot?: string;
  taskPrefix?: string;
  statuses?: string[];
}

interface SidebarItem {
  label?: string;
  slug?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
}

function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith(".") ? [] : walk(full, base);
    return entry.isFile() ? [toPosix(path.relative(base, full))] : [];
  });
}

function frontMatterOf(markdown: string): { data: Record<string, unknown>; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: markdown };
  const data = (parseYaml(match[1]!) ?? {}) as Record<string, unknown>;
  return { data, body: markdown.slice(match[0].length) };
}

/** The page's H1 (Starlight shows the title itself) and the body without it. */
export function splitTitle(body: string): { heading?: string; rest: string } {
  const lines = body.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  const match = first >= 0 ? lines[first]!.match(/^#\s+(.+?)\s*#*\s*$/) : null;
  if (!match) return { rest: body };
  lines.splice(0, first + 1);
  while (lines[0]?.trim() === "") lines.shift();
  return { heading: match[1]!, rest: lines.join("\n") };
}

/** A plain-text summary of the first paragraph, for the page's meta description. */
export function describe(body: string): string | undefined {
  let inFence = false;
  for (const block of body.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (/^(```|~~~)/.test(trimmed)) inFence = !inFence;
    if (inFence || !trimmed || /^(#|!\[|>|\||\[TOC\]|\[\[_|<|[-*+] |\d+\. |```|~~~)/.test(trimmed)) continue;
    const plain = trimmed
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label ?? target)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length <= 160) return plain;
    const cut = plain.slice(0, 157);
    return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  }
  return undefined;
}

function gitTagAtHead(repo: string): string | undefined {
  try {
    const tags = execFileSync("git", ["-C", repo, "tag", "--points-at", "HEAD"], { encoding: "utf8" })
      .split("\n")
      .map((tag) => tag.trim())
      .filter((tag) => /^v\d/.test(tag));
    return tags.sort().at(-1);
  } catch {
    return undefined;
  }
}

function countLines(content: string): number {
  if (content === "") return 0;
  const lines = content.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function readTasks(repo: string, taskRoot: string): Record<string, DocsTask> {
  const tasks: Record<string, DocsTask> = {};
  const dir = path.join(repo, taskRoot);
  for (const file of walk(dir)) {
    if (!file.endsWith(".md")) continue;
    const { data } = frontMatterOf(readFileSync(path.join(dir, file), "utf8"));
    const id = typeof data["id"] === "string" ? data["id"] : path.posix.basename(file, ".md");
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id)) continue;
    tasks[id] = {
      id,
      path: path.posix.join(taskRoot, file),
      title: typeof data["title"] === "string" ? data["title"] : id,
      ...(typeof data["status"] === "string" ? { status: data["status"] } : {}),
      ...(typeof data["type"] === "string" ? { type: data["type"] } : {}),
    };
  }
  return tasks;
}

/** Records the files that the docs' references name, and the contents of embedded ones. */
function collectFiles(index: DocsIndex, repo: string, sources: string[]): void {
  const files: Record<string, DocsFile> = {};
  for (const source of sources) {
    for (const match of source.matchAll(/(!?)\[\[([^[\]]+?)\]\]/g)) {
      const resolved = resolveReference(index, parseReference(match[2]!));
      if (resolved.kind !== "file") continue;
      const embed = match[1] === "!";
      if (resolved.path in files && !(embed && files[resolved.path]!.exists && !(resolved.path in index.embeds)))
        continue;
      const full = path.resolve(repo, resolved.path);
      const inside = !path.relative(repo, full).startsWith("..");
      if (!inside || !existsSync(full) || !statSync(full).isFile()) {
        files[resolved.path] = { exists: false };
        continue;
      }
      const content = readFileSync(full, "utf8");
      files[resolved.path] = { exists: true, lines: countLines(content) };
      if (embed && content.length <= MAX_EMBED_BYTES) index.embeds[resolved.path] = content;
    }
  }
  index.files = files;
}

function sidebarOf(pages: DocsPage[], homeFile: string): SidebarItem[] {
  const bySource = new Map(pages.map((page) => [page.source.replace(/\.md$/i, ""), page]));
  const rank = (title: string) => {
    const key = title.toLowerCase();
    const preferred = PREFERRED_ORDER.indexOf(key);
    if (preferred >= 0) return preferred;
    return LAST.includes(key) ? 1000 + LAST.indexOf(key) : 100;
  };
  const sortItems = (a: { title: string }, b: { title: string }) =>
    rank(a.title) - rank(b.title) || a.title.localeCompare(b.title);

  const build = (folder: string, depth: number): SidebarItem[] => {
    const prefix = folder ? `${folder}/` : "";
    const names = new Set<string>();
    for (const key of bySource.keys()) {
      if (!key.startsWith(prefix)) continue;
      names.add(key.slice(prefix.length).split("/")[0]!);
    }
    const entries = [...names].map((name) => ({ name, title: name.replace(/-/g, " ") }));
    entries.sort(depth === 0 ? sortItems : (a, b) => a.title.localeCompare(b.title));
    return entries.flatMap(({ name, title }): SidebarItem[] => {
      const key = `${prefix}${name}`;
      const page = bySource.get(key);
      if (page && page.source === homeFile) return [];
      const children = build(key, depth + 1);
      if (children.length === 0) return page ? [{ slug: page.slug }] : [];
      const items = page ? [{ label: "Overview", slug: page.slug }, ...children] : children;
      return [{ label: title, items }];
    });
  };

  const home = pages.find((page) => page.source === homeFile);
  return [...(home ? [{ label: "Introduction", slug: home.slug }] : []), ...build("", 0)];
}

function writeGenerated(index: DocsIndex, sidebar: SidebarItem[]): void {
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(path.join(generatedDir, "docs-index.json"), JSON.stringify(index, null, 2) + "\n");
  writeFileSync(path.join(generatedDir, "sidebar.json"), JSON.stringify(sidebar, null, 2) + "\n");
}

function writePage(file: string, data: Record<string, unknown>, body: string): void {
  const target = path.join(outDir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `---\n${stringifyYaml(data).trimEnd()}\n---\n\n${body.trimStart()}`);
}

/** A single page that says where the documentation comes from, for builds without the app repository. */
export function writePlaceholder(url = DEFAULT_URL): void {
  rmSync(outDir, { recursive: true, force: true });
  const index = emptyIndex(url, "main");
  index.pages = [{ source: "Home.md", file: "index.md", slug: "docs", title: "Home" }];
  writePage(
    "index.md",
    { title: "Documentation", slug: "docs", description: "Genbeya's user documentation." },
    [
      "The documentation is Genbeya's own wiki, which lives in the app repository and is copied here when the site is built.",
      "",
      `Read it [on GitHub](${url}/blob/main/docs/Home.md) for now, or sync it into this site:`,
      "",
      "```sh",
      "npm run sync-docs -- --repo ../genbeya",
      "```",
    ].join("\n"),
  );
  writeGenerated(index, [{ label: "Introduction", slug: "docs" }]);
  log(SCRIPT, "Wrote a placeholder page; the app repository's docs were not synced.");
}

export function syncDocs(args = parseArgs()): void {
  const docsArg = option(args, "docs", "GENBEYA_DOCS");
  const repo = path.resolve(
    root,
    option(args, "repo", "GENBEYA_REPO") ?? (docsArg ? path.dirname(path.resolve(root, docsArg)) : "../genbeya"),
  );
  const url = (option(args, "url", "GENBEYA_REPO_URL") ?? DEFAULT_URL).replace(/\/$/, "");

  if (args.has("placeholder")) return writePlaceholder(url);

  const settingsFile = path.join(repo, ".genbeya.yml");
  const settings: Settings = existsSync(settingsFile) ? (parseYaml(readFileSync(settingsFile, "utf8")) ?? {}) : {};
  const wikiRoot = (settings.wikiRoot ?? "docs").replace(/^\.?\/|\/$/g, "");
  const homeFile = settings.wikiHome ?? "Home.md";
  const docsDir = docsArg ? path.resolve(root, docsArg) : path.join(repo, wikiRoot);

  if (!existsSync(docsDir)) {
    throw new Error(
      `No documentation at ${docsDir}. Clone https://github.com/genbeya/genbeya next to this repository, ` +
        "or pass --repo <path> (or --docs <path>), or --placeholder for a build without docs.",
    );
  }
  const ref = option(args, "ref", "GENBEYA_REF") ?? gitTagAtHead(repo) ?? "main";

  const index: DocsIndex = {
    ...emptyIndex(url, ref),
    wikiRoot,
    taskPrefix: settings.taskPrefix ?? "",
    statuses: settings.statuses ?? DEFAULT_STATUSES,
    tasks: readTasks(repo, settings.taskRoot ?? "tasks"),
  };

  const all = walk(docsDir);
  const markdown = all.filter((file) => file.endsWith(".md"));
  index.pages = markdown.map((source) => ({
    source,
    file: source === homeFile ? "index.md" : source,
    slug: slugOfPage(source, homeFile),
    title: titleFromFileName(source),
  }));
  if (!index.taskPrefix) {
    index.taskPrefix = Object.keys(index.tasks)[0]?.replace(/-\d+$/, "") ?? "";
  }

  const sources = markdown.map((file) => readFileSync(path.join(docsDir, file), "utf8").replace(/\r\n/g, "\n"));
  collectFiles(index, repo, sources);

  rmSync(outDir, { recursive: true, force: true });
  for (const [i, page] of index.pages.entries()) {
    const { data, body } = frontMatterOf(sources[i]!);
    const { heading, rest } = splitTitle(body);
    const description = describe(rest);
    writePage(
      page.file,
      {
        ...data,
        title: heading ?? page.title,
        ...(description ? { description } : {}),
        slug: page.slug,
        editUrl: `${url}/edit/main/${wikiRoot}/${page.source}`,
      },
      rest,
    );
  }
  for (const file of all.filter((name) => !name.endsWith(".md"))) {
    const target = path.join(outDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(docsDir, file), target);
  }

  writeGenerated(index, sidebarOf(index.pages, homeFile));
  const embeds = Object.keys(index.embeds).length;
  log(
    SCRIPT,
    `Synced ${index.pages.length} pages and ${all.length - markdown.length} other files from ${toPosix(path.relative(root, docsDir))} ` +
      `(${Object.keys(index.tasks).length} tasks, ${Object.keys(index.files).length} referenced files, ${embeds} embeds; links point at ${ref}).`,
  );
}

if (import.meta.main) {
  try {
    syncDocs();
  } catch (error) {
    console.error(`[${SCRIPT}] ${(error as Error).message}`);
    process.exit(1);
  }
}
