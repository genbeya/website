# genbeya.fyi

The website of [Genbeya](https://github.com/genbeya/genbeya): the home page, the documentation, the browser demo
and the downloads. A static site built with [Astro](https://astro.build), [Starlight](https://starlight.astro.build)
for the docs, [GSAP](https://gsap.com) with ScrollTrigger for the home page's story and
[Pagefind](https://pagefind.app) for search, hosted on Cloudflare Pages.

**Privacy is literal here**: no cookies, no localStorage, sessionStorage or IndexedDB, no analytics, and not a single
request to another origin. Fonts are self-hosted, nothing comes from a CDN, and the GitHub API is only ever asked at
build time. The tests check all of it.

## Develop

Requires Node.js 24 and, for the documentation, a clone of the app repository next to this one:

```text
Downloads/
├── genbeya/            https://github.com/genbeya/genbeya
└── genbeya-website/    this repository
```

```bash
npm install
npx playwright install chromium   # renders Mermaid diagrams at build time, runs the end-to-end tests
npm run dev                       # http://localhost:4321
```

`npm run dev` and `npm run build` first sync whatever is missing: the docs from `../genbeya` (or a placeholder page
when there is no clone), the browser demo (or a placeholder). Re-sync by hand after changing the app's docs.

| Script                  | What it does                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Development server with hot reload                                                                |
| `npm run build`         | Static site in `dist/`, then the post-build checks (see [Security](#security-headers))            |
| `npm run preview`       | Serves `dist/` the way Cloudflare Pages does, with the headers of `dist/_headers`                 |
| `npm run sync-docs`     | Copies the app's wiki into the docs (`-- --repo <path>`, `--docs <path>`, `--ref <tag>`)          |
| `npm run sync-demo`     | Installs the browser demo at `/try/app/` (`-- --zip <file>` or `--source <dir>`, `--placeholder`) |
| `npm run fetch-release` | Writes the latest release's installers for the download page, from the GitHub API                 |
| `npm run check`         | `astro check` (TypeScript), ESLint and Prettier                                                   |
| `npm test`              | Unit tests (Vitest)                                                                               |
| `npm run test:e2e`      | End-to-end tests (Playwright) against `dist/` — build first                                       |
| `npm run screenshots`   | Screenshots of every page and a video of the story, for design reviews (`-- --out <dir>`)         |
| `npm run brand-images`  | Renders `public/og.png` and `public/apple-touch-icon.png` from the logo                           |
| `npm run format`        | Prettier                                                                                          |

### Where the content comes from

- **Documentation** — the app repository's wiki (`docs/`), the user documentation Genbeya keeps about itself.
  `npm run sync-docs` copies it to `src/content/docs/docs/` (ignored by Git), turns each page's first heading into
  Starlight's front matter, and writes `src/generated/docs-index.json`: the pages, the tasks of `tasks/`, the files that
  references name and the contents of embedded files. Sources: `--repo` / `GENBEYA_REPO` (default `../genbeya`),
  `--docs` / `GENBEYA_DOCS` (default the repository's wiki folder, `../genbeya/docs`), `--ref` / `GENBEYA_REF` (the Git
  ref links point at; default the release tag checked out, else `main`).
- **Browser demo** — the static bundle the app's release ships as `genbeya-web-demo.zip`. `npm run sync-demo` installs
  it at `public/try/app/` from `--zip` / `GENBEYA_DEMO_ZIP`, or from a local build (`--source` / `GENBEYA_DEMO_DIR`,
  default `../genbeya-demo/dist/demo/browser`), and rewrites an absolute `<base href="/">` to `/try/app/`. Without
  either it installs a placeholder page.
- **Downloads** — `src/generated/release.json`, written in CI by `npm run fetch-release`. Without it, the download page
  uses the sample in `src/data/release.sample.json` (version 0.0.1) and says so. When the app has no release yet, the
  file holds `{ "release": null }` and the page says the first release is coming soon.

## Architecture

```text
astro.config.ts            Astro, Starlight (re-skinned, components overridden), the Markdown pipeline
public/_headers            Security headers for Cloudflare Pages (hashes filled in after the build)
scripts/                   sync-docs, sync-demo, fetch-release, prepare, postbuild, serve, screenshots
src/
  components/              Header, footer, theme toggle, privacy notice, logo mark — shared by all pages
    home/                  The home page: RoomLogo (the layered logo), Story, Features, HowItWorks, …
    starlight/             Overrides of Starlight's header, sidebar, theme, footer and skip link
  data/                    Site facts (links, author, license) and the sample release
  layouts/BaseLayout.astro The frame of the marketing pages
  lib/                     downloads.ts (installers, which to offer), platform.ts (OS detection), release.ts
  markdown/                remark-genbeya.ts (the plugin), references.ts, mermaid.ts, docs-index.ts
  pages/                   index, try, download, 404 — the docs are Starlight's routes under /docs/
  scripts/                 Browser code: story.ts (GSAP), download.ts, theme.ts, reveal.ts
  styles/                  tokens.css (design tokens), global.css, starlight.css
tests/unit, tests/e2e      Vitest and Playwright
```

### The home page's story

`RoomLogo.astro` rebuilds `branding/genbeya.svg` from its exact geometry, split into one SVG per part, stacked in
the original drawing order: the left wall (a wiki page), the right wall (the task list), the back wall (the history, a
branch) and the floor (the team), plus the mono logo, labels and file cards that only appear during the story. Each part
has two wrappers: `.logo__layer`, moved by the scroll story, and `.logo__part`, moved by the intro — so the two
animations never fight over one transform.

`src/scripts/story.ts`:

1. **Intro** — on load, the walls fold up in 3D (`rotationY`/`rotationX` with perspective), the floor slides in, the
   page's lines write themselves, the branch draws itself (DrawSVG), the checkmarks tick and the people pop up.
2. **Scroll story** — the stage is pinned with CSS `position: sticky` (no layout-shifting pin spacer), and a GSAP
   timeline of seven units (the hero, then six chapters) is scrubbed by ScrollTrigger. Each chapter holds from `i` to
   `i + 0.65`, then hands over to the next. The logo's layers move between per-chapter states (`layerStates()`): an
   exploded, labelled room; then the wiki, history, task and team walls in turn, brought forward while the others dim,
   with a spotlight behind and their details animated (lines writing, the branch drawing, a task getting ticked, an AI
   agent joining the team); finally the mono logo, with the plain files it is made of floating out.
3. `data-chapter` on the section and `aria-current="step"` on the chapter rail follow the scroll position. Hidden
   chapters fade by opacity only, so screen readers still read them; focusing a link in one scrolls to it.

Only transforms and opacity are animated (plus stroke drawing inside the small SVG details); the layers are separate
composited elements. `gsap.matchMedia()` runs all of it only with `prefers-reduced-motion: no-preference`: with
reduced motion — or without JavaScript — the hero is still and the chapters are a list, each with a still picture of
its part of the logo (`<use>` of the hero's parts). Phones get the same story, stacked (logo above, text below).

### Genbeya's Markdown in the docs

`src/markdown/remark-genbeya.ts` renders what Genbeya adds to Markdown:

| Written                                                  | On the website                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `[[Page title]]`, `[[Guide/Wiki]]`, `[[Tasks#comments]]` | A link to the docs page (missing pages show red)                                    |
| `[[GENBEYA-12]]`, plain `GENBEYA-12`                     | A link to the task's file on GitHub, with its title and status from the synced repo |
| `[[src/file.ts#L1-L5]]`                                  | A link to the file's lines on GitHub (files not in the repository show dashed)      |
| `![[src/file.ts#L1-L5]]`                                 | The lines, as a code block with the path — read from the repository at sync time    |
| `[TOC]`, `[[_TOC_]]`                                     | Removed: Starlight shows the table of contents                                      |
| `[SUBPAGES]`, `[[_TOSP_]]`                               | A list of the page's subpages                                                       |
| `> [!NOTE]` … `> [!CAUTION]`, Obsidian kinds             | Starlight asides, with custom titles                                                |
| ` ```mermaid `                                           | SVG drawn at build time (light and dark), no Mermaid in the browser                 |
| `$…$`, `$$…$$`, ` ```math `                              | KaTeX, at build time                                                                |
| `showLineNumbers=10`, ` ```diff-ts `                     | Expressive Code's line numbers and diff syntax                                      |
| Relative links (`Tasks.md#comments`)                     | Links to the docs pages; links to other files of the repository go to GitHub        |
| Remote images                                            | Links (the site loads nothing from elsewhere)                                       |

### Privacy

- No cookies and no browser storage: Starlight's theme picker (localStorage) and sidebar memory (sessionStorage) are
  replaced; the theme toggle changes the page and is forgotten on reload. The privacy notice, too, comes back on every
  page load — storing that it was closed would contradict what it says.
- No third-party requests: Inter and JetBrains Mono come from `@fontsource`, GSAP and Pagefind are bundled, Mermaid
  and KaTeX render at build time, assets are never inlined as `data:` URLs, and remote images in the docs become links.
  The post-build step fails the build if a page or stylesheet would load anything from another origin, and the
  end-to-end tests abort and report any such request.
- The download page detects the visitor's system in the browser (User-Agent Client Hints, else the user agent);
  nothing is sent anywhere.

### Security headers

`public/_headers` sets, for every page: a Content-Security-Policy that allows only this origin (`default-src 'none'`;
scripts, styles, fonts, images and connections from `'self'`; `'wasm-unsafe-eval'` for Pagefind's WebAssembly — not
`'unsafe-eval'`; `style-src-attr 'unsafe-inline'` for the style attributes of Expressive Code, KaTeX and GSAP; no
frames), `Referrer-Policy: no-referrer`, a Permissions-Policy that denies every feature except writing to the clipboard
(the code blocks' copy buttons), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and HSTS. The browser demo
at `/try/app/` gets a policy of its own that mirrors the one in its `index.html` (WebAssembly for PlantUML, workers, the app's inline styles), still limited to this origin.

`scripts/postbuild.ts` moves the Mermaid diagrams' `<style>` elements into a stylesheet, puts the SHA-256 hashes of the
remaining inline scripts (the theme script, which must run before the first paint, and Starlight's search shortcut) into
the policy, and checks that no line exceeds Cloudflare's 2,000 characters.

## Test

```bash
npm run check      # types, lint, formatting
npm test           # unit tests
npm run build && npm run test:e2e
```

The end-to-end tests serve `dist/` with its real headers, so a CSP violation fails them. They check that the story's
chapters show at their scroll positions, the reduced-motion version, references in the docs, Pagefind search, the
installer offered to mocked Windows, Mac (Apple silicon and Intel), Linux and iPhone browsers, the privacy notice
(closes, comes back after a reload, doesn't cover content on phones), that no page requests anything from another
origin, and that localStorage, sessionStorage, IndexedDB and cookies stay empty.

## Deploy

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds, tests and deploys the site to Cloudflare Pages:

- on every push to `main` (pull requests are built and tested, not deployed),
- when the app repository announces a release (`repository_dispatch` of type `genbeya-release`),
- and by hand (**Actions → Deploy → Run workflow**).

It finds the app's latest `v*` release (`npm run fetch-release`), checks out `genbeya/genbeya` at that tag, syncs the
docs, downloads the release's `genbeya-web-demo.zip` into `/try/app/`, writes the installer list for the download page,
builds, runs every test and deploys `dist/` with `cloudflare/wrangler-action`. Before the app's first release it still
succeeds: the docs come from the app's default branch, the demo is a placeholder and the download page says the first
release is coming soon.

### One-time setup

1. **Cloudflare Pages project** — in the Cloudflare dashboard, **Workers & Pages → Create → Pages → Direct Upload**,
   name it `genbeya-website` (as in `wrangler.toml`). Don't connect it to Git: the workflow uploads the build.
2. **Custom domain** — in the project, **Custom domains → Set up a domain**: `genbeya.fyi` (and `www.genbeya.fyi`,
   redirected to it with a Redirect Rule if you like).
3. **API token** — **My Profile → API Tokens → Create Token → Custom token** with the permission
   _Account → Cloudflare Pages → Edit_, limited to your account.
4. **Secrets** — in this repository, **Settings → Secrets and variables → Actions**:
   - `CLOUDFLARE_API_TOKEN` — the token from step 3
   - `CLOUDFLARE_ACCOUNT_ID` — your account ID (in the dashboard's URL, or **Workers & Pages → Account details**)

   Without them the workflow builds and tests, and skips the deployment with a notice.

5. **Release trigger** (optional) — so a new app release updates the site at once, add a step at the end of the app's
   release job, with a fine-grained token that may write _Contents_ of this repository (here assumed to be
   `genbeya/genbeya-website`), stored in the app repository as `WEBSITE_DISPATCH_TOKEN`:

   ```yaml
   - name: Update genbeya.fyi
     env:
       GH_TOKEN: ${{ secrets.WEBSITE_DISPATCH_TOKEN }}
     run: gh api repos/genbeya/genbeya-website/dispatches -f event_type=genbeya-release -F "client_payload[tag]=$tag"
   ```

   Without it, the site picks up the release on its next push or manual run.

## License

This website is licensed like the app, under the
[Functional Source License, Version 1.1, ALv2 Future License](LICENSE.md) (FSL-1.1-ALv2): use, change and share it
freely, but not as a competing commercial product or service; each version becomes Apache 2.0 two years after its
release. The documentation comes from the app repository, under its
[license](https://github.com/genbeya/genbeya/blob/main/LICENSE.md); the files Genbeya writes into repositories are
under the [MIT License](https://github.com/genbeya/genbeya/blob/main/LICENSE-MIT.md). The footer links both (`license`
in `src/data/site.ts`). The name Genbeya and its logo are not licensed for use as another product's branding. The
fonts, Inter and JetBrains Mono, come from Fontsource under the SIL Open Font License.
