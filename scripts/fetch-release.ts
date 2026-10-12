/**
 * npm run fetch-release [-- --repo genbeya/genbeya] [--out src/generated/release.json] [--none]
 *
 * Asks the GitHub API (at build time, never from a visitor's browser) for the app's latest
 * release and writes its version and installers for the download page. Before the first
 * release it writes `{ "release": null }`, and the page says the first release is coming.
 * Uses GH_TOKEN or GITHUB_TOKEN when set. In GitHub Actions it also sets the step outputs
 * `tag` (empty without a release) and `has-demo`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReleaseData } from "../src/lib/downloads.ts";
import { generatedDir, log, option, parseArgs, root } from "./lib/cli.ts";

const SCRIPT = "fetch-release";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at?: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; size: number }[];
}

async function github<T>(url: string): Promise<T | null> {
  const token = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "genbeya-website-build",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

const semver = (tag: string) =>
  tag
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((part) => Number(part) || 0);
const newer = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};

/** The latest published `v*` release: the one GitHub marks latest, else the newest by version. */
export async function latestRelease(repo: string): Promise<GitHubRelease | null> {
  const latest = await github<GitHubRelease>(`https://api.github.com/repos/${repo}/releases/latest`);
  if (latest && /^v\d/.test(latest.tag_name)) return latest;
  const all = (await github<GitHubRelease[]>(`https://api.github.com/repos/${repo}/releases?per_page=100`)) ?? [];
  return (
    all
      .filter((release) => !release.draft && !release.prerelease && /^v\d/.test(release.tag_name))
      .reduce<GitHubRelease | null>(
        (best, release) => (!best || newer(release.tag_name, best.tag_name) ? release : best),
        null,
      ) ?? null
  );
}

function setOutput(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const repo = option(args, "repo", "GENBEYA_GITHUB_REPO") ?? "genbeya/genbeya";
  const out = path.resolve(root, option(args, "out", "RELEASE_JSON") ?? path.join(generatedDir, "release.json"));

  let data: ReleaseData = { release: null };
  if (!args.has("none")) {
    const release = await latestRelease(repo);
    if (release) {
      data = {
        release: {
          version: release.tag_name.replace(/^v/, ""),
          tag: release.tag_name,
          url: release.html_url,
          ...(release.published_at ? { publishedAt: release.published_at } : {}),
          assets: release.assets.map(({ name, size }) => ({ name, size })),
        },
      };
    }
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  const tag = data.release?.tag ?? "";
  setOutput("tag", tag);
  setOutput("has-demo", String(data.release?.assets.some((asset) => asset.name === "genbeya-web-demo.zip") ?? false));
  log(
    SCRIPT,
    data.release
      ? `${repo} ${tag}: ${data.release.assets.length} assets → ${path.relative(root, out)}`
      : `${repo} has no release yet → ${path.relative(root, out)}`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`[${SCRIPT}] ${(error as Error).message}`);
    process.exit(1);
  });
}
