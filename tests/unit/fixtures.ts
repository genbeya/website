import type { DocsIndex } from "../../src/markdown/docs-index.ts";

/** A small docs index, shaped like the one sync-docs writes for the app repository. */
export function fixtureIndex(): DocsIndex {
  return {
    repository: { url: "https://github.com/genbeya/genbeya", ref: "v1.2.3" },
    wikiRoot: "docs",
    taskPrefix: "GENBEYA",
    statuses: ["backlog", "todo", "in-progress", "review", "done"],
    pages: [
      { source: "Home.md", file: "index.md", slug: "docs", title: "Home" },
      {
        source: "Getting-started.md",
        file: "Getting-started.md",
        slug: "docs/getting-started",
        title: "Getting started",
      },
      { source: "Guide.md", file: "Guide.md", slug: "docs/guide", title: "Guide" },
      { source: "Guide/Wiki.md", file: "Guide/Wiki.md", slug: "docs/guide/wiki", title: "Wiki" },
      { source: "Guide/Tasks.md", file: "Guide/Tasks.md", slug: "docs/guide/tasks", title: "Tasks" },
      { source: "Guide/AI-agents.md", file: "Guide/AI-agents.md", slug: "docs/guide/ai-agents", title: "AI agents" },
    ],
    tasks: {
      "GENBEYA-9": { id: "GENBEYA-9", path: "tasks/GENBEYA-9.md", title: "Harden SSH hosts", status: "in-progress" },
      "GENBEYA-12": {
        id: "GENBEYA-12",
        path: "tasks/GENBEYA-12.md",
        title: "Virtualize long lists",
        status: "backlog",
      },
      "GENBEYA-14": { id: "GENBEYA-14", path: "tasks/epic/GENBEYA-14.md", title: "The rewrite", status: "done" },
    },
    files: {
      "src/client/app/app.ts": { exists: true, lines: 8 },
      ".genbeya.yml": { exists: true, lines: 3 },
      "src/old-name.ts": { exists: false },
    },
    embeds: {
      "src/client/app/app.ts": "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\n",
    },
  };
}
