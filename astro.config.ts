import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import type { Plugin } from "vite";
import { emptyIndex, type DocsIndex } from "./src/markdown/docs-index.ts";
import { renderMermaid } from "./src/markdown/mermaid.ts";
import remarkGenbeya from "./src/markdown/remark-genbeya.ts";
import { site } from "./src/data/site.ts";

const generated = (name: string) => fileURLToPath(new URL(`./src/generated/${name}`, import.meta.url));
const readJson = <T>(name: string, fallback: T): T =>
  existsSync(generated(name)) ? (JSON.parse(readFileSync(generated(name), "utf8")) as T) : fallback;

/** Written by `npm run sync-docs`; `npm run dev` and `npm run build` sync first when it is missing. */
const docsIndex = readJson<DocsIndex>("docs-index.json", emptyIndex(site.repository, "main"));
const sidebar = readJson<unknown[]>("sidebar.json", [{ label: "Introduction", slug: "docs" }]);

/**
 * Starlight remembers the sidebar's state in sessionStorage. This site stores nothing in the
 * browser, so the module that does it is replaced by an empty one.
 */
function noSidebarPersistence(): Plugin {
  return {
    name: "genbeya:no-sidebar-persistence",
    enforce: "pre",
    load(id) {
      return /components-internals[\\/]SidebarPersistState(\.[jt]s)?$/.test(id.split("?")[0]!) ? "export {};" : null;
    },
  };
}

export default defineConfig({
  site: site.url,
  trailingSlash: "ignore",
  // No inline <style> blocks: everything is a file that the CSP's 'self' allows.
  build: { inlineStylesheets: "never" },
  // Prefetching stays on this origin; it only makes navigation feel instant.
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  devToolbar: { enabled: false },
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkMath,
        [
          remarkGenbeya,
          {
            index: docsIndex,
            docsDir: fileURLToPath(new URL("./src/content/docs/docs", import.meta.url)),
            renderMermaid,
          },
        ],
      ],
      rehypePlugins: [[rehypeKatex, { trust: false, strict: "ignore", throwOnError: false }]],
    }),
  },
  vite: {
    plugins: [noSidebarPersistence()],
    // Scripts, fonts and images stay files (no inline modules, no data: URLs), so the CSP
    // allows them by 'self' alone.
    build: { assetsInlineLimit: 0 },
  },
  integrations: [
    starlight({
      title: "Genbeya",
      description: site.pitch,
      logo: { src: "./src/assets/genbeya-small.svg", alt: "" },
      favicon: "/favicon.svg",
      lastUpdated: false,
      // The site has its own 404 page, in the marketing pages' style.
      disable404Route: true,
      pagination: true,
      editLink: { baseUrl: `${site.repository}/edit/main/docs/` },
      social: [{ icon: "github", label: "GitHub", href: site.repository }],
      sidebar: sidebar as never,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ["./src/styles/starlight.css", "katex/dist/katex.min.css"],
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        useStarlightUiThemeColors: true,
        styleOverrides: {
          borderRadius: "0.625rem",
          codeFontFamily: "var(--font-mono)",
          uiFontFamily: "var(--font-ui)",
          codeFontSize: "0.8125rem",
          frames: { shadowColor: "transparent" },
        },
      },
      head: [
        { tag: "meta", attrs: { name: "referrer", content: "no-referrer" } },
        { tag: "meta", attrs: { property: "og:image", content: `${site.url}/og.png` } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
      ],
      components: {
        ThemeProvider: "./src/components/starlight/ThemeProvider.astro",
        ThemeSelect: "./src/components/starlight/ThemeSelect.astro",
        Header: "./src/components/starlight/Header.astro",
        Sidebar: "./src/components/starlight/Sidebar.astro",
        MobileMenuFooter: "./src/components/starlight/MobileMenuFooter.astro",
        Footer: "./src/components/starlight/Footer.astro",
        SkipLink: "./src/components/starlight/SkipLink.astro",
      },
    }),
  ],
});
