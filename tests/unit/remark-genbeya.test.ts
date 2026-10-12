import path from "node:path";
import type { Root } from "mdast";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";
import remarkGenbeya, { languageOf, statusName, type RemarkGenbeyaOptions } from "../../src/markdown/remark-genbeya.ts";
import { fixtureIndex } from "./fixtures.ts";

const docsDir = path.resolve("fixture-docs");

function processor(options: Partial<RemarkGenbeyaOptions> = {}) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkGenbeya, { index: fixtureIndex(), docsDir, ...options })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/** Renders Markdown as the page at `source` (a path below the wiki folder). */
async function render(markdown: string, source = "Guide/Wiki.md", options: Partial<RemarkGenbeyaOptions> = {}) {
  const file = new VFile({ path: path.join(docsDir, source), value: markdown });
  return String(await processor(options).process(file));
}

/** The transformed Markdown tree, before it becomes HTML. */
async function transform(markdown: string, source = "Guide/Wiki.md") {
  const p = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkGenbeya, { index: fixtureIndex(), docsDir });
  const file = new VFile({ path: path.join(docsDir, source), value: markdown });
  return (await p.run(p.parse(file), file)) as Root;
}

describe("remark-genbeya: references", () => {
  it("renders a task reference as a link to the task file on GitHub, with its title and status", async () => {
    const html = await render("See [[GENBEYA-12]].");
    expect(html).toContain('href="https://github.com/genbeya/genbeya/blob/v1.2.3/tasks/GENBEYA-12.md"');
    expect(html).toContain('class="gb-ref gb-ref--task gb-tone-idle"');
    expect(html).toContain('<span class="gb-ref__id">GENBEYA-12</span>');
    expect(html).toContain("Virtualize long lists");
    expect(html).toContain('<span class="gb-ref__status">Backlog</span>');
  });

  it("uses the own text of a reference, also inside tables", async () => {
    const html = await render("| a | b |\n| --- | --- |\n| x | [[GENBEYA-14\\|the rewrite]] |");
    expect(html).toContain('<span class="gb-ref__title">the rewrite</span>');
    expect(html).not.toContain("gb-ref__status");
  });

  it("links pages by title and by path, and sections of them", async () => {
    const html = await render("[[Getting started]], [[Guide/Wiki]] and [[Tasks#comments]]");
    expect(html).toContain('<a href="/docs/getting-started/" class="gb-ref gb-ref--page">Getting started</a>');
    expect(html).toContain('<a href="/docs/guide/wiki/" class="gb-ref gb-ref--page">Wiki</a>');
    expect(html).toContain('href="/docs/guide/tasks/#comments"');
  });

  it("links files and their lines to GitHub", async () => {
    const html = await render("[[src/client/app/app.ts#L1-L5]]");
    expect(html).toContain('href="https://github.com/genbeya/genbeya/blob/v1.2.3/src/client/app/app.ts#L1-L5"');
    expect(html).toContain('<span class="gb-ref__lines">:1–5</span>');
  });

  it("shows missing pages and files without a link", async () => {
    const html = await render("[[Meeting notes]] and [[src/old-name.ts]]");
    expect(html).toContain('class="gb-ref gb-ref--page gb-ref--missing"');
    expect(html).toContain('class="gb-ref gb-ref--file gb-ref--missing"');
    expect(html).not.toContain('old-name.ts"');
  });

  it("links plain task IDs that exist, and leaves code and unknown IDs alone", async () => {
    const html = await render("GENBEYA-14 and GENBEYA-777, but not `GENBEYA-14`.");
    expect(html).toContain('class="gb-ref-id gb-tone-done"');
    expect(html).toContain("GENBEYA-777");
    expect(html).not.toContain(
      'class="gb-ref-id gb-tone-done" data-status="done" title="The rewrite (done)">GENBEYA-777',
    );
    expect(html).toContain("<code>GENBEYA-14</code>");
  });

  it("leaves references in code untouched", async () => {
    const html = await render("`[[GENBEYA-9]]`\n\n```md\n[[GENBEYA-9]]\n```");
    expect(html).not.toContain("gb-ref");
  });
});

describe("remark-genbeya: blocks", () => {
  it("removes [TOC] and [[_TOC_]], since Starlight shows its own table of contents", async () => {
    const html = await render("# Title\n\n[TOC]\n\n[[_TOC_]]\n\n## Section");
    expect(html).not.toContain("TOC");
  });

  it("lists the subpages for [SUBPAGES]", async () => {
    const html = await render("[SUBPAGES]", "Guide.md");
    expect(html).toContain('<ul class="gb-subpages">');
    expect(html).toContain('<a href="/docs/guide/ai-agents/">AI agents</a>');
    expect(html).toContain('<a href="/docs/guide/wiki/">Wiki</a>');
  });

  it("embeds the lines of a file as a code block with its path, from the synced contents", async () => {
    const tree = await transform("![[src/client/app/app.ts#L2-L4]]");
    const codes: { lang?: string | null; meta?: string | null; value: string }[] = [];
    visit(tree, "code", (node) => void codes.push(node));
    expect(codes).toEqual([
      {
        type: "code",
        lang: "ts",
        meta: 'title="src/client/app/app.ts:2–4" showLineNumbers startLineNumber=2',
        value: "line 2\nline 3\nline 4",
      },
    ]);
  });

  it("says when an embed asks for lines past the end of the file", async () => {
    const tree = await transform("![[src/client/app/app.ts#L7-L20]]");
    const directives: string[] = [];
    visit(tree, "containerDirective", (node) => void directives.push(node.name));
    expect(directives).toEqual(["caution"]);
  });

  it("turns GitHub alerts into Starlight asides, with their title and their references", async () => {
    const tree = await transform("> [!WARNING] Mind the migration\n> See [[GENBEYA-9]].\n\n> [!TIP]\n> Tip text");
    const asides: { name: string; label: string }[] = [];
    visit(tree, "containerDirective", (node) => {
      const first = node.children[0];
      const label =
        first?.type === "paragraph" ? first.children.map((c) => ("value" in c ? c.value : "")).join("") : "";
      asides.push({ name: node.name, label });
    });
    expect(asides).toEqual([
      { name: "caution", label: "Mind the migration" },
      { name: "tip", label: "Tip" },
    ]);
    const html = await render("> [!NOTE]\n> See [[GENBEYA-9]].");
    expect(html).toContain("gb-ref--task");
  });

  it("maps Docusaurus code block options to Expressive Code's", async () => {
    const tree = await transform(
      '```ts showLineNumbers=10 title="a.ts"\nx\n```\n\n```diff-ts\n-a\n+b\n```\n\n```plantuml\nA -> B\n```',
    );
    const codes: { lang?: string | null; meta?: string | null }[] = [];
    visit(tree, "code", (node) => void codes.push({ lang: node.lang, meta: node.meta }));
    expect(codes).toEqual([
      { lang: "ts", meta: 'showLineNumbers startLineNumber=10 title="a.ts"' },
      { lang: "diff", meta: 'lang="ts"' },
      { lang: "text", meta: 'title="PlantUML diagram (drawn in the Genbeya app)"' },
    ]);
  });

  it("renders Mermaid diagrams with the given renderer, in both themes", async () => {
    const html = await render("```mermaid\nflowchart LR\n  a --> b\n```", "Guide/Wiki.md", {
      renderMermaid: async (sources) =>
        sources.map((source) => ({ light: `<svg>L ${source.length}</svg>`, dark: "<svg>D</svg>" })),
    });
    expect(html).toContain('<figure class="gb-diagram"');
    expect(html).toContain('<div class="gb-diagram__theme gb-diagram__theme--light"><svg>L 22</svg></div>');
    expect(html).toContain('<div class="gb-diagram__theme gb-diagram__theme--dark"><svg>D</svg></div>');
  });

  it("turns ```math blocks into display math", async () => {
    const html = await render("```math\nE = mc^2\n```");
    expect(html).toContain('<pre><code class="language-math math-display">E = mc^2</code></pre>');
  });
});

describe("remark-genbeya: links and images", () => {
  it("rewrites relative links between pages to the site", async () => {
    const html = await render("[Tasks](Tasks.md#comments) and [Home](../Home.md)");
    expect(html).toContain('<a href="/docs/guide/tasks/#comments">Tasks</a>');
    expect(html).toContain('<a href="/docs/">Home</a>');
  });

  it("turns remote images into links, so the site loads nothing from elsewhere", async () => {
    const html = await render("![A cat](https://example.com/cat.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://example.com/cat.png"');
    expect(html).toContain("A cat");
  });

  it("keeps local images", async () => {
    const html = await render("![Board](../images/board.png)");
    expect(html).toContain('<img src="../images/board.png" alt="Board">');
  });

  it("leaves files outside the synced docs alone", async () => {
    const file = new VFile({ path: path.resolve("elsewhere", "page.md"), value: "[[GENBEYA-9]]" });
    const html = String(await processor().process(file));
    expect(html).toBe("<p>[[GENBEYA-9]]</p>");
  });
});

describe("helpers", () => {
  it("names statuses as the app does", () => {
    expect(statusName("in-progress")).toBe("In progress");
    expect(statusName("done")).toBe("Done");
  });

  it("knows the language of embedded files", () => {
    expect(languageOf("src/app.ts")).toBe("ts");
    expect(languageOf(".genbeya.yml")).toBe("yaml");
    expect(languageOf("LICENSE")).toBe("text");
  });
});
