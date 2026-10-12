/**
 * Genbeya's references (`[[GENBEYA-12]]`, `[[Page title]]`, `[[src/file.ts#L1-L5]]`),
 * resolved against the docs index the way the app resolves them.
 */
import { titleKey, type DocsIndex, type DocsPage, type DocsTask } from "./docs-index.ts";

export interface ParsedReference {
  /** What the reference names, without the `#…` part. */
  target: string;
  /** The part after `#`: a heading anchor, or a line range of a file. */
  anchor?: string;
  /** Own text after `|`. */
  label?: string;
}

export interface LineRange {
  start: number;
  end: number;
}

export type ResolvedReference =
  | { kind: "task"; task: DocsTask; url: string; label?: string; tone: TaskTone }
  | { kind: "page"; page: DocsPage; href: string; text: string }
  | { kind: "file"; path: string; lines?: LineRange; url: string; exists: boolean; text: string }
  | { kind: "missing-task"; id: string; text: string }
  | { kind: "missing-page"; text: string };

/** Colour family of a task's status: its place in the workflow, from the first state to done. */
export type TaskTone = "idle" | "active" | "done" | "unknown";

export const TASK_ID = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * Parses the inside of `[[…]]`. The first `|` starts the own text; inside tables it is written
 * `\|`, which Markdown usually unescapes before this sees it — and which means the same here.
 */
export function parseReference(inner: string): ParsedReference {
  const text = inner.trim().replace(/\\\|/g, "|");
  const pipe = text.indexOf("|");
  const head = (pipe < 0 ? text : text.slice(0, pipe)).trim();
  const label = pipe < 0 ? undefined : text.slice(pipe + 1).trim() || undefined;
  const hash = head.indexOf("#");
  const target = hash < 0 ? head : head.slice(0, hash).trim();
  const anchor = hash < 0 ? undefined : head.slice(hash + 1).trim() || undefined;
  return { target, ...(anchor ? { anchor } : {}), ...(label ? { label } : {}) };
}

/** `L10`, `L10-L20` or `L10-20` → the lines; anything else → undefined. */
export function parseLineRange(anchor: string | undefined): LineRange | undefined {
  const match = anchor?.match(/^L(\d+)(?:-L?(\d+))?$/i);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return start <= end ? { start, end } : { start: end, end: start };
}

export function githubAnchor(lines: LineRange | undefined): string {
  if (!lines) return "";
  return lines.start === lines.end ? `#L${lines.start}` : `#L${lines.start}-L${lines.end}`;
}

export function blobUrl(index: DocsIndex, path: string, lines?: LineRange): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${index.repository.url}/blob/${encodeURIComponent(index.repository.ref)}/${encoded}${githubAnchor(lines)}`;
}

export function pageHref(page: DocsPage, anchor?: string): string {
  return `/${page.slug}/${anchor ? `#${anchor}` : ""}`;
}

export function taskTone(index: DocsIndex, status: string | undefined): TaskTone {
  const position = status ? index.statuses.indexOf(status) : -1;
  if (position < 0) return "unknown";
  if (position === index.statuses.length - 1) return "done";
  return position === 0 ? "idle" : "active";
}

/** Finds a page by its path below the wiki folder or from the repository root, with or without `.md`. */
export function findPageByPath(index: DocsIndex, path: string): DocsPage | undefined {
  const wanted = stripMd(path.replace(/^\.?\//, "")).toLowerCase();
  const rootPrefix = `${index.wikiRoot.toLowerCase()}/`;
  const belowWiki = wanted.startsWith(rootPrefix) ? wanted.slice(rootPrefix.length) : undefined;
  return index.pages.find((page) => {
    const source = stripMd(page.source).toLowerCase();
    return source === wanted || source === belowWiki;
  });
}

export function findPageByTitle(index: DocsIndex, title: string): DocsPage | undefined {
  const key = titleKey(title);
  return index.pages.find((page) => titleKey(page.title) === key);
}

const stripMd = (path: string) => path.replace(/\.md$/i, "");

const looksLikeFile = (target: string) =>
  target.includes("/") || /\.[A-Za-z0-9]+$/.test(target) || target.startsWith(".");

/** Resolves a parsed reference to what it names. */
export function resolveReference(index: DocsIndex, ref: ParsedReference): ResolvedReference {
  const { target, anchor, label } = ref;

  if (TASK_ID.test(target)) {
    const task = index.tasks[target];
    if (!task) return { kind: "missing-task", id: target, text: label ?? target };
    return {
      kind: "task",
      task,
      url: blobUrl(index, task.path),
      tone: taskTone(index, task.status),
      ...(label ? { label } : {}),
    };
  }

  const page = findPageByPath(index, target) ?? findPageByTitle(index, target);
  if (page) {
    const text = label ?? (anchor ? `${page.title} › ${anchor.replace(/-/g, " ")}` : page.title);
    return { kind: "page", page, href: pageHref(page, anchor), text };
  }

  if (looksLikeFile(target)) {
    const path = target.replace(/^\.\//, "");
    const lines = parseLineRange(anchor);
    const exists = index.files[path]?.exists ?? false;
    const text = label ?? path;
    return { kind: "file", path, url: blobUrl(index, path, lines), exists, text, ...(lines ? { lines } : {}) };
  }

  return { kind: "missing-page", text: label ?? target };
}

const ASSET = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)$/i;

/**
 * Rewrites a relative Markdown link of a page (`Wiki.md#links`, `../Home.md`) to the site:
 * links to pages go to their docs page, links to other files of the repository to GitHub.
 * Returns undefined for links that stay as they are (web links, anchors, images).
 */
export function rewriteRelativeLink(index: DocsIndex, currentSource: string, href: string): string | undefined {
  if (!href || href.startsWith("#") || href.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return undefined;
  const hashAt = href.indexOf("#");
  const pathPart = decodeURI(hashAt < 0 ? href : href.slice(0, hashAt));
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  if (!pathPart || ASSET.test(pathPart)) return undefined;

  const resolved = resolvePosix(dirname(currentSource), pathPart);
  const page = findPageByPath(index, resolved);
  if (page) return `/${page.slug}/${hash}`;

  const fromRoot = resolvePosix(index.wikiRoot, resolved);
  if (fromRoot.startsWith("../")) return undefined;
  const lines = parseLineRange(hash.slice(1));
  const url = blobUrl(index, fromRoot, lines);
  return lines || !hash ? url : `${url}${hash}`;
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** Joins a relative path onto a base folder; the result starts with `../` when it leaves the base's tree. */
export function resolvePosix(base: string, relative: string): string {
  const parts = base ? base.split("/") : [];
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0 || parts[parts.length - 1] === "..") parts.push("..");
      else parts.pop();
    } else parts.push(segment);
  }
  return parts.join("/");
}
