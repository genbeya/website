import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { externalCss, externalResources, inlineBlocks } from "../../scripts/postbuild.ts";
import { headersFor, parseHeaders } from "../../scripts/serve.ts";
import { rebase } from "../../scripts/sync-demo.ts";

const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const rules = parseHeaders(headers);

describe("_headers", () => {
  it("sends the security headers on every page", () => {
    const page = headersFor(rules, "/docs/guide/wiki/");
    expect(page.get("content-security-policy")).toMatch(/^default-src 'none'; script-src 'self'/);
    const scriptSrc = page
      .get("content-security-policy")!
      .split(";")
      .find((directive) => directive.trim().startsWith("script-src "));
    expect(scriptSrc).not.toMatch(/'unsafe-eval'|'unsafe-inline'/);
    expect(page.get("referrer-policy")).toBe("no-referrer");
    expect(page.get("x-content-type-options")).toBe("nosniff");
    expect(page.get("permissions-policy")).toContain("camera=()");
    expect(page.get("permissions-policy")).toContain("geolocation=()");
  });

  it("only ever allows this origin", () => {
    const csp = headersFor(rules, "/").get("content-security-policy")!;
    expect(csp).not.toMatch(/https?:/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("gives the demo a policy of its own instead of adding a second one", () => {
    const demo = headersFor(rules, "/try/app/index.html").get("content-security-policy")!;
    expect(demo).toMatch(/^default-src 'self'/);
    expect(demo).not.toContain(",");
  });

  it("keeps every line within Cloudflare's limit, placeholders filled in", () => {
    const filled = headers.replace("{{SCRIPT_HASHES}}", "'sha256-x'".repeat(10)).replace("{{STYLE_HASHES}}", "");
    for (const line of filled.split("\n")) expect(line.length).toBeLessThanOrEqual(2000);
  });
});

describe("postbuild checks", () => {
  it("finds inline scripts and styles, but not JSON data blocks", () => {
    const html =
      '<script>a()</script><script type="module" src="/x.js"></script><script type="application/json">{}</script><style>p{}</style>';
    expect(inlineBlocks(html)).toEqual({ scripts: ["a()"], styles: ["p{}"] });
  });

  it("finds resources from other origins", () => {
    expect(externalResources('<script src="https://cdn.example.com/x.js"></script>')).toHaveLength(1);
    expect(externalResources('<link rel="stylesheet" href="//fonts.example.com/a.css">')).toHaveLength(1);
    expect(externalResources('<img src="https://example.com/a.png">')).toHaveLength(1);
    expect(externalResources('<a href="https://github.com/genbeya/genbeya">GitHub</a>')).toHaveLength(0);
    expect(externalResources('<script src="/_astro/a.js"></script><img src="/a.png">')).toHaveLength(0);
    expect(externalCss("a{background:url(https://example.com/a.png)} @import 'https://x.dev/a.css';")).toHaveLength(2);
    expect(externalCss('a{mask:url("data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>")}')).toHaveLength(
      0,
    );
  });
});

describe("sync-demo", () => {
  it("serves the demo below /try/app/", () => {
    expect(rebase('<head><base href="/"></head>')).toBe('<head><base href="/try/app/"></head>');
    expect(rebase('<base href="./">')).toBe('<base href="./">');
  });
});
