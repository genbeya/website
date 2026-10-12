/**
 * npm run preview [-- --port 4321] [--dir dist]
 *
 * Serves the built site the way Cloudflare Pages does, including the headers of dist/_headers
 * (so the Content-Security-Policy is enforced locally and in the end-to-end tests), directory
 * indexes, trailing-slash redirects and the 404 page.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { log, option, parseArgs, root } from "./lib/cli.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
  ".pf_meta": "application/octet-stream",
  ".pf_index": "application/octet-stream",
  ".pf_fragment": "application/octet-stream",
  ".webmanifest": "application/manifest+json",
};

interface Rule {
  pattern: RegExp;
  set: [string, string][];
  detach: string[];
}

/** Parses Cloudflare Pages' _headers format: a path pattern, then indented `Name: value` or `! Name` lines. */
export function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  let current: Rule | undefined;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      const source = raw
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/:\w+/g, "[^/]+");
      current = { pattern: new RegExp(`^${source}$`), set: [], detach: [] };
      rules.push(current);
      continue;
    }
    const line = raw.trim();
    if (!current) continue;
    if (line.startsWith("!")) current.detach.push(line.slice(1).trim().toLowerCase());
    else {
      const colon = line.indexOf(":");
      current.set.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
    }
  }
  return rules;
}

/** The headers for a path: every matching rule applies in order; `!` removes what earlier ones set. */
export function headersFor(rules: Rule[], pathname: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const name of rule.detach) headers.delete(name);
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      headers.set(key, headers.has(key) ? `${headers.get(key)}, ${value}` : value);
    }
  }
  return headers;
}

function send(res: ServerResponse, status: number, file: string, headers: Map<string, string>): void {
  res.statusCode = status;
  for (const [name, value] of headers) res.setHeader(name, value);
  res.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
}

export function serve(dir: string, port: number) {
  const headersFile = path.join(dir, "_headers");
  const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, "utf8")) : [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const file = path.join(dir, pathname);
    if (!file.startsWith(dir)) {
      res.writeHead(400).end();
      return;
    }
    const headers = headersFor(rules, pathname);

    if (existsSync(file) && statSync(file).isFile()) return send(res, 200, file, headers);
    if (existsSync(path.join(file, "index.html"))) {
      if (!pathname.endsWith("/")) {
        res.writeHead(308, { location: `${pathname}/${url.search}` }).end();
        return;
      }
      return send(res, 200, path.join(file, "index.html"), headers);
    }
    if (existsSync(`${file}.html`)) return send(res, 200, `${file}.html`, headers);
    const notFound = path.join(dir, "404.html");
    if (existsSync(notFound)) return send(res, 404, notFound, headersFor(rules, "/404"));
    res.writeHead(404).end("Not found");
  });
  server.listen(port);
  return server;
}

if (import.meta.main) {
  const args = parseArgs();
  const port = Number(option(args, "port", "PORT") ?? 4321);
  const dir = path.resolve(root, option(args, "dir", "SERVE_DIR") ?? "dist");
  serve(dir, port);
  log("serve", `Serving ${path.relative(root, dir) || "."} with its _headers at http://localhost:${port}/`);
}
