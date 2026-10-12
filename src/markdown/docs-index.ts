/**
 * The docs index: what `npm run sync-docs` learns from the app repository, so the
 * Markdown pipeline can resolve Genbeya references without the repository at hand.
 */

export interface DocsPage {
  /** Path below the wiki folder, as in the app repository: `Guide/Wiki.md`. */
  source: string;
  /** Path below `src/content/docs/docs/`: the same, except the wiki's home is `index.md`. */
  file: string;
  /** Starlight slug: `docs/guide/wiki`. */
  slug: string;
  /** Title as Genbeya names the page, from its file name: `Getting started`. */
  title: string;
}

export interface DocsTask {
  id: string;
  /** Path from the repository root: `tasks/GENBEYA-12.md`. */
  path: string;
  title: string;
  status?: string;
  type?: string;
}

export interface DocsFile {
  exists: boolean;
  /** Number of lines, for files that exist. */
  lines?: number;
}

export interface DocsIndex {
  repository: {
    /** Web URL of the repository: `https://github.com/genbeya/genbeya`. */
    url: string;
    /** Git ref that links point at: the release tag, or a branch. */
    ref: string;
  };
  /** The wiki folder, from the repository root: `docs`. */
  wikiRoot: string;
  taskPrefix: string;
  statuses: string[];
  pages: DocsPage[];
  tasks: Record<string, DocsTask>;
  /** Files that references in the docs name, keyed by path from the repository root. */
  files: Record<string, DocsFile>;
  /** Contents of the files the docs embed (`![[file]]`), keyed by path from the repository root. */
  embeds: Record<string, string>;
}

/** Title of a page from its file name: `Getting-started.md` → `Getting started`. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  return base.replace(/\.md$/i, "").replace(/-/g, " ");
}

/** Key that titles are compared by: case, dashes, underscores and spaces don't matter. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[-_\s]+/g, " ")
    .trim();
}

/** Slug of one path segment, as GitHub (and Starlight) make heading anchors. */
export function slugSegment(segment: string): string {
  return segment
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** Starlight slug of a page below the wiki folder. */
export function slugOfPage(source: string, homeFile: string): string {
  if (source === homeFile) return "docs";
  const segments = source.replace(/\.md$/i, "").split("/").map(slugSegment);
  return ["docs", ...segments].join("/");
}

export const emptyIndex = (url: string, ref: string): DocsIndex => ({
  repository: { url, ref },
  wikiRoot: "docs",
  taskPrefix: "GENBEYA",
  statuses: [],
  pages: [],
  tasks: {},
  files: {},
  embeds: {},
});
