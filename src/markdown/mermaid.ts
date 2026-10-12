/**
 * Renders Mermaid diagrams to SVG at build time, in a headless Chromium (Playwright),
 * once for the light and once for the dark theme. The site ships no Mermaid code.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { MermaidConfig } from "mermaid";
import { createMermaidRenderer, type MermaidRenderer } from "mermaid-isomorphic";
import type { RenderedDiagram } from "./remark-genbeya.ts";

const require = createRequire(import.meta.url);
const font = '"Inter Variable", "Inter", system-ui, sans-serif';

const themes: Record<"light" | "dark", MermaidConfig> = {
  light: {
    theme: "base",
    fontFamily: font,
    themeVariables: {
      fontFamily: font,
      primaryColor: "#eeeefe",
      primaryBorderColor: "#7c7ff2",
      primaryTextColor: "#1c1d21",
      lineColor: "#5f6069",
      secondaryColor: "#f3f3f5",
      tertiaryColor: "#ffffff",
      edgeLabelBackground: "#ffffff",
    },
  },
  dark: {
    theme: "base",
    fontFamily: font,
    themeVariables: {
      darkMode: true,
      fontFamily: font,
      background: "#16171a",
      primaryColor: "#23244a",
      primaryBorderColor: "#7c7ff2",
      primaryTextColor: "#e8e8ea",
      lineColor: "#a2a3ab",
      secondaryColor: "#1c1d21",
      tertiaryColor: "#16171a",
      edgeLabelBackground: "#16171a",
      textColor: "#e8e8ea",
    },
  },
};

let renderer: MermaidRenderer | undefined;

async function renderOne(source: string, theme: "light" | "dark"): Promise<string> {
  renderer ??= createMermaidRenderer();
  const css = pathToFileURL(require.resolve("@fontsource-variable/inter/wght.css"));
  // Ids derive from the diagram, so they are stable between builds and unique on a page.
  const prefix = `m${createHash("sha1").update(source).digest("hex").slice(0, 10)}-${theme}`;
  const [result] = await renderer([source], { css, mermaidConfig: themes[theme], prefix });
  if (result?.status !== "fulfilled") throw new Error(`A Mermaid diagram failed to render: ${String(result?.reason)}`);
  return result.value.svg;
}

/**
 * Renders diagrams for both themes. Their <style> elements stay in the SVG for now; the
 * postbuild step moves them into a stylesheet, so the CSP needs no inline styles.
 */
export async function renderMermaid(sources: string[]): Promise<RenderedDiagram[]> {
  const out: RenderedDiagram[] = [];
  for (const source of sources) {
    out.push({ light: await renderOne(source, "light"), dark: await renderOne(source, "dark") });
  }
  return out;
}
