/**
 * remark plugin that renders Genbeya's Markdown on the website: references, embeds,
 * `[TOC]` and `[SUBPAGES]`, GitHub alerts, Mermaid diagrams, Docusaurus-style code block
 * options, relative links between pages, and remote images (which become links, so the
 * site never loads anything from elsewhere).
 */
import path from "node:path";
import type {
  Blockquote,
  Code,
  Link,
  List,
  ListItem,
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import type { ContainerDirective } from "mdast-util-directive";
import type {} from "mdast-util-to-hast";
import { toString } from "mdast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import type { VFile } from "vfile";
import type { DocsIndex, DocsPage } from "./docs-index.ts";
import {
  blobUrl,
  parseReference,
  resolveReference,
  rewriteRelativeLink,
  taskTone,
  type LineRange,
  type ResolvedReference,
} from "./references.ts";

export interface RenderedDiagram {
  light: string;
  dark: string;
}

export interface RemarkGenbeyaOptions {
  index: DocsIndex;
  /** Absolute path of the folder the synced pages are in (`src/content/docs/docs`). */
  docsDir: string;
  /** Renders Mermaid diagrams to SVG; without it, diagrams stay code blocks. */
  renderMermaid?: (sources: string[]) => Promise<RenderedDiagram[]>;
}

/** The app shows at most this many lines of an embed. */
const EMBED_LIMIT = 400;

const REFERENCE = /\[\[([^[\]]+?)\]\]/g;

type Props = Record<string, string | number | boolean | string[]>;

/** An inline mdast node that becomes `<tag …>` in HTML. */
function inline(tagName: string, properties: Props, children: PhrasingContent[]): PhrasingContent {
  return { type: "emphasis", data: { hName: tagName, hProperties: properties }, children };
}

/** A block mdast node that becomes `<tag …>` in HTML. */
function block(tagName: string, properties: Props, children: PhrasingContent[]): Paragraph {
  return { type: "paragraph", data: { hName: tagName, hProperties: properties }, children };
}

const span = (className: string, children: PhrasingContent[], extra: Props = {}) =>
  inline("span", { className: className.split(" "), ...extra }, children);

const text = (value: string): Text => ({ type: "text", value });

function link(url: string, children: PhrasingContent[], properties: Props = {}, title?: string): Link {
  return { type: "link", url, title: title ?? null, children, data: { hProperties: properties } };
}

const externalProps = (className: string): Props => ({ className: className.split(" "), rel: "noopener" });

function linesText(lines: LineRange): string {
  return lines.start === lines.end ? `:${lines.start}` : `:${lines.start}–${lines.end}`;
}

/** `in-progress` → `In progress`, as the app names statuses. */
export function statusName(status: string): string {
  const words = status.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The phrasing nodes that show one resolved reference. */
export function renderReference(resolved: ResolvedReference): PhrasingContent {
  switch (resolved.kind) {
    case "task": {
      const { task, tone, label, url } = resolved;
      const status = task.status ?? "unknown";
      const children: PhrasingContent[] = [
        span("gb-ref__dot", [], { ariaHidden: "true" }),
        span("gb-ref__id", [text(task.id)]),
        span("gb-ref__title", [text(label ?? task.title)]),
      ];
      if (!label) children.push(span("gb-ref__status", [text(statusName(status))]));
      return link(
        url,
        children,
        { ...externalProps(`gb-ref gb-ref--task gb-tone-${tone}`), dataStatus: status },
        `${task.id}: ${task.title} (${status})`,
      );
    }
    case "page":
      return link(resolved.href, [text(resolved.text)], { className: ["gb-ref", "gb-ref--page"] });
    case "file": {
      const children: PhrasingContent[] = [span("gb-ref__path", [text(resolved.text)])];
      if (resolved.lines && resolved.text === resolved.path) {
        children.push(span("gb-ref__lines", [text(linesText(resolved.lines))]));
      }
      if (!resolved.exists) {
        return span("gb-ref gb-ref--file gb-ref--missing", children, {
          title: `${resolved.path} is not in the repository`,
        });
      }
      return link(resolved.url, children, externalProps("gb-ref gb-ref--file"), `${resolved.path} on GitHub`);
    }
    case "missing-task":
      return span("gb-ref gb-ref--task gb-ref--missing", [text(resolved.text)], {
        title: `There is no task ${resolved.id}`,
      });
    case "missing-page":
      return span("gb-ref gb-ref--page gb-ref--missing", [text(resolved.text)], {
        title: "This page does not exist yet",
      });
  }
}

/** Splits a text node into text, references and links to plain task IDs. */
function expandText(value: string, index: DocsIndex): PhrasingContent[] | undefined {
  const out: PhrasingContent[] = [];
  let last = 0;
  let changed = false;
  for (const match of value.matchAll(REFERENCE)) {
    const at = match.index;
    if (at > last) out.push(...linkTaskIds(value.slice(last, at), index));
    out.push(renderReference(resolveReference(index, parseReference(match[1]!))));
    last = at + match[0].length;
    changed = true;
  }
  if (last < value.length) out.push(...linkTaskIds(value.slice(last), index));
  if (!changed && out.length === 1 && out[0]!.type === "text") return undefined;
  return out;
}

/** Plain task IDs (`GENBEYA-14`) link to their task when the task exists, as in the app. */
function linkTaskIds(value: string, index: DocsIndex): PhrasingContent[] {
  if (!index.taskPrefix) return [text(value)];
  const pattern = new RegExp(`\\b${escapeRegExp(index.taskPrefix)}-\\d+\\b`, "g");
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const task = index.tasks[match[0]];
    if (!task) continue;
    if (match.index > last) out.push(text(value.slice(last, match.index)));
    const status = task.status ?? "unknown";
    out.push(
      link(
        blobUrl(index, task.path),
        [text(task.id)],
        { ...externalProps(`gb-ref-id gb-tone-${taskTone(index, task.status)}`), dataStatus: status },
        `${task.title} (${status})`,
      ),
    );
    last = match.index + match[0].length;
  }
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text of a paragraph that holds nothing but text (and emphasis, as in `[[_TOC_]]`). */
function plainParagraph(node: Paragraph): string | undefined {
  const simple = node.children.every((child) => child.type === "text" || child.type === "emphasis");
  return simple ? toString(node).trim() : undefined;
}

const LANGUAGES: Record<string, string> = {
  ts: "ts",
  mts: "ts",
  cts: "ts",
  tsx: "tsx",
  js: "js",
  mjs: "js",
  cjs: "js",
  jsx: "jsx",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "md",
  css: "css",
  scss: "scss",
  html: "html",
  sh: "sh",
  bash: "sh",
  ps1: "powershell",
  rs: "rust",
  toml: "toml",
  py: "python",
  go: "go",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  swift: "swift",
  sql: "sql",
  xml: "xml",
};

export function languageOf(file: string): string {
  const ext = path.posix.extname(file).slice(1).toLowerCase();
  return LANGUAGES[ext] ?? "text";
}

/** The nodes that show an embed: `![[file#L1-L5]]` on its own line. */
function renderEmbed(index: DocsIndex, inner: string): RootContent[] {
  const resolved = resolveReference(index, parseReference(inner));
  if (resolved.kind !== "file" || !resolved.exists) {
    return [{ type: "paragraph", children: [renderReference(resolved)] }];
  }
  const content = index.embeds[resolved.path];
  if (content === undefined) return [{ type: "paragraph", children: [renderReference(resolved)] }];

  const all = content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const lines = resolved.lines;
  if (lines && lines.end > all.length) {
    return [
      aside("caution", "Embed out of range", [
        {
          type: "paragraph",
          children: [
            text(`${resolved.path} has ${all.length} lines; the embed asks for lines ${lines.start}–${lines.end}.`),
          ],
        },
      ]),
    ];
  }
  let shown = lines ? all.slice(lines.start - 1, lines.end) : all;
  const cut = shown.length > EMBED_LIMIT;
  if (cut) shown = shown.slice(0, EMBED_LIMIT);

  const title = `${resolved.path}${lines ? linesText(lines) : ""}`;
  const meta = [`title=${JSON.stringify(title)}`];
  if (lines && lines.start > 1) meta.push("showLineNumbers", `startLineNumber=${lines.start}`);
  else if (lines) meta.push("showLineNumbers");
  const code: Code = { type: "code", lang: languageOf(resolved.path), meta: meta.join(" "), value: shown.join("\n") };

  const caption = block("p", { className: ["gb-embed-source"] }, [
    link(
      resolved.url,
      [text(cut ? `Showing the first ${EMBED_LIMIT} lines. View the whole file on GitHub` : "View on GitHub")],
      externalProps("gb-embed-source__link"),
    ),
  ]);
  return [code, caption];
}

function aside(variant: string, label: string, children: RootContent[]): ContainerDirective {
  return {
    type: "containerDirective",
    name: variant,
    attributes: {},
    children: [
      { type: "paragraph", data: { directiveLabel: true }, children: [text(label)] },
      ...(children as never[]),
    ],
  } as ContainerDirective;
}

/** GitHub's alert kinds and Obsidian's extra ones, mapped to Starlight's aside variants. */
const ALERTS: Record<string, string> = {
  note: "note",
  info: "note",
  todo: "note",
  abstract: "note",
  summary: "note",
  quote: "note",
  important: "note",
  example: "note",
  question: "note",
  tip: "tip",
  hint: "tip",
  success: "tip",
  done: "tip",
  warning: "caution",
  attention: "caution",
  caution: "danger",
  danger: "danger",
  error: "danger",
  bug: "danger",
  failure: "danger",
};

const ALERT_MARKER = /^\[!([A-Za-z]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/;

/** `> [!NOTE]` and friends → a Starlight aside (a container directive Starlight renders). */
function alertToAside(node: Blockquote): ContainerDirective | undefined {
  const first = node.children[0];
  if (first?.type !== "paragraph") return undefined;
  const head = first.children[0];
  if (head?.type !== "text") return undefined;
  const match = head.value.match(ALERT_MARKER);
  if (!match) return undefined;
  const kind = match[1]!.toLowerCase();
  const variant = ALERTS[kind];
  if (!variant) return undefined;

  const title = match[3]!.trim() || kind.charAt(0).toUpperCase() + kind.slice(1);
  const rest = head.value.slice(match[0].length);
  const remaining: PhrasingContent[] = [...(rest ? [text(rest)] : []), ...first.children.slice(1)];
  // A soft line break right after the marker line leaves an empty first line.
  while (remaining[0]?.type === "break") remaining.shift();
  const body: RootContent[] = [
    ...(remaining.length > 0 ? [{ type: "paragraph", children: remaining } as Paragraph] : []),
    ...node.children.slice(1),
  ];
  return aside(variant, title, body);
}

/** Docusaurus-style options (`showLineNumbers=10`, ` ```diff-ts `) → Expressive Code's. */
function normaliseCode(node: Code): void {
  const diffLang = node.lang?.match(/^diff-([\w+#-]+)$/);
  if (diffLang) {
    node.lang = "diff";
    node.meta = [node.meta, `lang="${diffLang[1]}"`].filter(Boolean).join(" ");
  }
  if (node.lang === "plantuml" || node.lang === "puml") {
    node.lang = "text";
    node.meta = [node.meta, 'title="PlantUML diagram (drawn in the Genbeya app)"'].filter(Boolean).join(" ");
  }
  if (node.meta) {
    node.meta = node.meta.replace(/\bshowLineNumbers=(\d+)/, "showLineNumbers startLineNumber=$1");
  }
}

/** ` ```math ` code blocks → display math, as on GitHub (rehype-katex renders it). */
function mathBlock(value: string): RootContent {
  return {
    type: "paragraph",
    data: {
      hName: "pre",
      hChildren: [
        {
          type: "element",
          tagName: "code",
          properties: { className: ["language-math", "math-display"] },
          children: [{ type: "text", value }],
        },
      ],
    },
    children: [],
  } as Paragraph;
}

function subpagesList(index: DocsIndex, page: DocsPage): List {
  const folder = page.source.replace(/\.md$/i, "") + "/";
  const children = index.pages
    .filter((other) => other.source.startsWith(folder) && !other.source.slice(folder.length).includes("/"))
    .sort((a, b) => a.title.localeCompare(b.title));
  return {
    type: "list",
    ordered: false,
    spread: false,
    data: { hProperties: { className: ["gb-subpages"] } },
    children: children.map((child): ListItem => ({
      type: "listItem",
      spread: false,
      children: [{ type: "paragraph", children: [link(`/${child.slug}/`, [text(child.title)])] }],
    })),
  };
}

/** The page a file being processed is, or undefined for files outside the synced docs. */
export function pageOfFile(options: RemarkGenbeyaOptions, file: VFile): DocsPage | undefined {
  if (!file.path) return undefined;
  const relative = path.relative(options.docsDir, file.path).split(path.sep).join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return options.index.pages.find((page) => page.file === relative);
}

export default function remarkGenbeya(options: RemarkGenbeyaOptions) {
  const { index } = options;

  return async function transformer(tree: Root, file: VFile): Promise<void> {
    const page = pageOfFile(options, file);
    if (!page) return;

    const diagrams: { node: Code; parent: Parent; index: number }[] = [];

    visit(tree, (node, position, parent) => {
      if (!parent || position === undefined) return;

      if (node.type === "paragraph") {
        const plain = plainParagraph(node);
        // `[[_TOC_]]` arrives as `[[`, emphasised `TOC`, `]]`.
        if (plain === "[TOC]" || plain === "[[_TOC_]]" || plain === "[[TOC]]") {
          parent.children.splice(position, 1);
          return [SKIP, position];
        }
        if (plain === "[SUBPAGES]" || plain === "[[_TOSP_]]" || plain === "[[TOSP]]") {
          parent.children.splice(position, 1, subpagesList(index, page));
          return [SKIP, position + 1];
        }
        const embed = plain?.match(/^!\[\[([^[\]]+)\]\]$/);
        if (embed) {
          const nodes = renderEmbed(index, embed[1]!);
          parent.children.splice(position, 1, ...(nodes as never[]));
          return [SKIP, position + nodes.length];
        }
        return undefined;
      }

      if (node.type === "blockquote") {
        const replaced = alertToAside(node);
        if (!replaced) return undefined;
        parent.children[position] = replaced as never;
        // Visit the aside in place of the quote, so references inside it render too.
        return position;
      }

      if (node.type === "code") {
        if (node.lang === "mermaid" && options.renderMermaid) {
          diagrams.push({ node, parent, index: position });
          return SKIP;
        }
        if (node.lang === "math") {
          parent.children[position] = mathBlock(node.value) as never;
          return SKIP;
        }
        normaliseCode(node);
        return SKIP;
      }

      if (node.type === "image" && /^https?:\/\//i.test(node.url)) {
        // Remote images are not loaded (as in the app): they become links.
        parent.children[position] = link(node.url, [text(node.alt || node.url)], externalProps("gb-remote-image"));
        return SKIP;
      }

      if (node.type === "link") {
        const rewritten = rewriteRelativeLink(index, page.source, node.url);
        if (rewritten) node.url = rewritten;
        return SKIP;
      }

      if (node.type === "heading" || node.type === "inlineCode" || node.type === "linkReference") return SKIP;

      if (node.type === "text") {
        const expanded = expandText(node.value, index);
        if (!expanded) return undefined;
        parent.children.splice(position, 1, ...(expanded as never[]));
        return [SKIP, position + expanded.length];
      }
      return undefined;
    });

    if (diagrams.length > 0 && options.renderMermaid) {
      const rendered = await options.renderMermaid(diagrams.map(({ node }) => node.value));
      for (const [i, { node, parent }] of diagrams.entries()) {
        const svg = rendered[i];
        const at = parent.children.indexOf(node as never);
        if (!svg || at < 0) continue;
        parent.children[at] = {
          type: "html",
          value:
            `<figure class="gb-diagram" role="group" aria-label="Diagram">` +
            `<div class="gb-diagram__theme gb-diagram__theme--light">${svg.light}</div>` +
            `<div class="gb-diagram__theme gb-diagram__theme--dark">${svg.dark}</div>` +
            `</figure>`,
        } as never;
      }
    }
  };
}
