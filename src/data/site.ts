/** Facts about the site and the app that more than one page uses. */
export const site = {
  name: "Genbeya",
  url: "https://genbeya.fyi",
  pitch:
    "Genbeya puts your whole project — docs, tasks, decisions and code — into the Git repository, as plain files you can version, review and use anywhere.",
  repository: "https://github.com/genbeya/genbeya",
  releases: "https://github.com/genbeya/genbeya/releases",
  author: "Emanuel Knecht",
  /** The app's license, and the MIT License of the files it writes into repositories. */
  license: {
    name: "FSL-1.1-ALv2",
    url: "https://github.com/genbeya/genbeya/blob/main/LICENSE.md",
    generated: { name: "MIT", url: "https://github.com/genbeya/genbeya/blob/main/LICENSE-MIT.md" },
  },
  privacy: "No cookies, no tracking, no data sold — this site makes no third-party requests.",
} as const;

export interface NavItem {
  label: string;
  href: string;
  /** Marks the item as current when the path starts with this prefix. */
  match?: string;
  external?: boolean;
}

/** The top bar, the same on the marketing pages and in the documentation. */
export const nav: NavItem[] = [
  { label: "Home", href: "/", match: "/" },
  { label: "Docs", href: "/docs/", match: "/docs/" },
  { label: "Try it", href: "/try/", match: "/try/" },
  { label: "Download", href: "/download/", match: "/download/" },
  { label: "GitHub", href: site.repository, external: true },
];

/** Whether a nav item is the current section for the given path. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  if (!item.match) return false;
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return item.match === "/" ? path === "/" : path.startsWith(item.match);
}
