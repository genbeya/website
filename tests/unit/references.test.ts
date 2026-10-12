import { describe, expect, it } from "vitest";
import { slugOfPage, titleFromFileName, titleKey } from "../../src/markdown/docs-index.ts";
import {
  parseLineRange,
  parseReference,
  resolvePosix,
  resolveReference,
  rewriteRelativeLink,
} from "../../src/markdown/references.ts";
import { fixtureIndex } from "./fixtures.ts";

describe("parseReference", () => {
  it("reads a target, an anchor and a label", () => {
    expect(parseReference("Tasks#comments")).toEqual({ target: "Tasks", anchor: "comments" });
    expect(parseReference("GENBEYA-9|the SSH work")).toEqual({ target: "GENBEYA-9", label: "the SSH work" });
    expect(parseReference(" src/app.ts#L10-L20 ")).toEqual({ target: "src/app.ts", anchor: "L10-L20" });
  });

  it("treats an escaped pipe as a separator, as inside tables", () => {
    expect(parseReference("GENBEYA-14\\|the rewrite")).toEqual({ target: "GENBEYA-14", label: "the rewrite" });
  });
});

describe("parseLineRange", () => {
  it("reads single lines and ranges, with or without the second L", () => {
    expect(parseLineRange("L10")).toEqual({ start: 10, end: 10 });
    expect(parseLineRange("L10-L20")).toEqual({ start: 10, end: 20 });
    expect(parseLineRange("L10-20")).toEqual({ start: 10, end: 20 });
    expect(parseLineRange("L20-L10")).toEqual({ start: 10, end: 20 });
  });

  it("ignores anything else", () => {
    expect(parseLineRange("comments")).toBeUndefined();
    expect(parseLineRange(undefined)).toBeUndefined();
  });
});

describe("page titles", () => {
  it("come from file names", () => {
    expect(titleFromFileName("Guide/Getting-started.md")).toBe("Getting started");
  });

  it("match regardless of case, dashes and underscores", () => {
    expect(titleKey("Getting-started")).toBe(titleKey("getting started"));
    expect(titleKey("getting_started")).toBe(titleKey("Getting Started"));
  });

  it("give Starlight slugs, the home page being the docs root", () => {
    expect(slugOfPage("Home.md", "Home.md")).toBe("docs");
    expect(slugOfPage("Guide/AI-agents.md", "Home.md")).toBe("docs/guide/ai-agents");
  });
});

describe("resolveReference", () => {
  const index = fixtureIndex();
  const resolve = (inner: string) => resolveReference(index, parseReference(inner));

  it("links a task to its file on GitHub, at the synced ref, with its status tone", () => {
    expect(resolve("GENBEYA-14")).toMatchObject({
      kind: "task",
      url: "https://github.com/genbeya/genbeya/blob/v1.2.3/tasks/epic/GENBEYA-14.md",
      tone: "done",
    });
    expect(resolve("GENBEYA-12")).toMatchObject({ tone: "idle" });
    expect(resolve("GENBEYA-9")).toMatchObject({ tone: "active" });
  });

  it("marks tasks that don't exist", () => {
    expect(resolve("GENBEYA-999")).toMatchObject({ kind: "missing-task", id: "GENBEYA-999" });
  });

  it("finds pages by title, by path below the wiki and by path from the root", () => {
    expect(resolve("getting started")).toMatchObject({ kind: "page", href: "/docs/getting-started/" });
    expect(resolve("Guide/Wiki")).toMatchObject({ kind: "page", href: "/docs/guide/wiki/", text: "Wiki" });
    expect(resolve("docs/Guide/Wiki.md")).toMatchObject({ kind: "page", href: "/docs/guide/wiki/" });
    expect(resolve("Home")).toMatchObject({ kind: "page", href: "/docs/" });
  });

  it("links a section of a page", () => {
    expect(resolve("Tasks#comments")).toMatchObject({ href: "/docs/guide/tasks/#comments", text: "Tasks › comments" });
  });

  it("links files and lines to GitHub", () => {
    expect(resolve("src/client/app/app.ts#L1-L5")).toMatchObject({
      kind: "file",
      exists: true,
      url: "https://github.com/genbeya/genbeya/blob/v1.2.3/src/client/app/app.ts#L1-L5",
      lines: { start: 1, end: 5 },
    });
    expect(resolve(".genbeya.yml#L2")).toMatchObject({
      kind: "file",
      url: expect.stringMatching(/\.genbeya\.yml#L2$/),
    });
  });

  it("marks files that are not in the repository and pages that don't exist", () => {
    expect(resolve("src/old-name.ts")).toMatchObject({ kind: "file", exists: false });
    expect(resolve("Meeting notes")).toMatchObject({ kind: "missing-page", text: "Meeting notes" });
  });
});

describe("rewriteRelativeLink", () => {
  const index = fixtureIndex();

  it("sends links between pages to their docs pages", () => {
    expect(rewriteRelativeLink(index, "Home.md", "Guide/Wiki.md")).toBe("/docs/guide/wiki/");
    expect(rewriteRelativeLink(index, "Guide/Wiki.md", "Tasks.md#comments")).toBe("/docs/guide/tasks/#comments");
    expect(rewriteRelativeLink(index, "Guide/Wiki.md", "../Home.md#start-here")).toBe("/docs/#start-here");
    expect(rewriteRelativeLink(index, "Guide/Wiki.md", "Tasks")).toBe("/docs/guide/tasks/");
  });

  it("sends links to other files of the repository to GitHub", () => {
    expect(rewriteRelativeLink(index, "Guide/Wiki.md", "../../src/app.ts#L3")).toBe(
      "https://github.com/genbeya/genbeya/blob/v1.2.3/src/app.ts#L3",
    );
    expect(rewriteRelativeLink(index, "Home.md", "../README.md")).toBe(
      "https://github.com/genbeya/genbeya/blob/v1.2.3/README.md",
    );
  });

  it("leaves web links, anchors and images alone", () => {
    expect(rewriteRelativeLink(index, "Home.md", "https://example.com/a.md")).toBeUndefined();
    expect(rewriteRelativeLink(index, "Home.md", "#start-here")).toBeUndefined();
    expect(rewriteRelativeLink(index, "Home.md", "images/board.png")).toBeUndefined();
    expect(rewriteRelativeLink(index, "Home.md", "mailto:someone@example.com")).toBeUndefined();
  });

  it("leaves links that leave the repository alone", () => {
    expect(rewriteRelativeLink(index, "Home.md", "../../elsewhere.md")).toBeUndefined();
  });
});

describe("resolvePosix", () => {
  it("joins relative paths", () => {
    expect(resolvePosix("Guide", "../Home.md")).toBe("Home.md");
    expect(resolvePosix("docs", "../src/a.ts")).toBe("src/a.ts");
    expect(resolvePosix("", "../a")).toBe("../a");
  });
});
