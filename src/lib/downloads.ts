/**
 * The installers of a release, and which one suits a visitor's system. Pure functions:
 * the download page uses them at build time and in the browser, the tests directly.
 */

export type Os = "windows" | "macos" | "linux";
export type Arch = "x64" | "arm64";
export type Variant = "electron" | "tauri" | "deno";
export type Format = "exe" | "msi" | "dmg" | "AppImage" | "deb" | "rpm";

export interface ReleaseAsset {
  name: string;
  size?: number;
}

/** What `npm run fetch-release` writes: the latest release, or null before the first one. */
export interface ReleaseData {
  release: {
    version: string;
    tag: string;
    url: string;
    publishedAt?: string;
    assets: ReleaseAsset[];
  } | null;
  /** True for the sample data used in local development. */
  sample?: boolean;
}

export interface Installer {
  name: string;
  url: string;
  size?: number;
  variant: Variant;
  os: Os;
  arch: Arch;
  format: Format;
}

export interface Release {
  version: string;
  tag: string;
  url: string;
  publishedAt?: string;
  installers: Installer[];
  sample: boolean;
}

export const OS_NAMES: Record<Os, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };
export const VARIANT_NAMES: Record<Variant, string> = { electron: "Electron", tauri: "Tauri", deno: "Deno Desktop" };
export const VARIANTS: Variant[] = ["electron", "tauri", "deno"];
export const OSES: Os[] = ["windows", "macos", "linux"];

const NAME =
  /^Genbeya-(.+?)-(electron|tauri|deno)-(windows|macos|linux)-(x64|arm64)(-setup)?\.(exe|msi|dmg|AppImage|deb|rpm)$/;

/** Reads `Genbeya-<version>-<variant>-<os>-<arch>[-setup].<ext>`; anything else is not an installer. */
export function parseInstallerName(name: string): Omit<Installer, "url" | "size"> | null {
  const match = name.match(NAME);
  if (!match) return null;
  const [, , variant, os, arch, , format] = match;
  return { name, variant: variant as Variant, os: os as Os, arch: arch as Arch, format: format as Format };
}

export function downloadUrl(repository: string, tag: string, file: string): string {
  return `${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}

const FORMAT_ORDER: Format[] = ["exe", "msi", "dmg", "AppImage", "deb", "rpm"];

/** The release's installers with their download links, in a stable order. */
export function toRelease(data: ReleaseData, repository: string): Release | null {
  if (!data.release) return null;
  const { version, tag, url, publishedAt, assets } = data.release;
  const installers = assets
    .map((asset): Installer | null => {
      const parsed = parseInstallerName(asset.name);
      if (!parsed) return null;
      return {
        ...parsed,
        url: downloadUrl(repository, tag, asset.name),
        ...(asset.size ? { size: asset.size } : {}),
      };
    })
    .filter((installer): installer is Installer => installer !== null)
    .sort(
      (a, b) =>
        VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) ||
        OSES.indexOf(a.os) - OSES.indexOf(b.os) ||
        (a.arch === b.arch ? 0 : a.arch === "arm64" ? -1 : 1) ||
        FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format),
    );
  return { version, tag, url, ...(publishedAt ? { publishedAt } : {}), installers, sample: data.sample === true };
}

export interface Platform {
  os: Os | "unknown";
  arch: Arch | "unknown";
  mobile: boolean;
}

export interface Pick {
  /** The installer to offer first: the recommended (Electron) one for the system. */
  primary?: Installer;
  /** For Macs: the installer for the other architecture ("Intel Mac?"). */
  otherArch?: Installer;
  /** True when the system's architecture has no build of its own and runs the x64 one emulated. */
  emulated: boolean;
}

/** The format each system's recommended installer comes in. */
const PRIMARY_FORMAT: Record<Os, Format> = { windows: "exe", macos: "dmg", linux: "AppImage" };

/**
 * Picks the installer for a platform: Electron (the recommended variant), in the system's main
 * format, for its architecture. Macs default to Apple silicon when the architecture is unknown;
 * Windows and Linux on ARM get the x64 build, which runs emulated.
 */
export function pickInstaller(installers: Installer[], platform: Platform, variant: Variant = "electron"): Pick {
  if (platform.os === "unknown") return { emulated: false };
  const os = platform.os;
  const candidates = installers.filter(
    (installer) => installer.variant === variant && installer.os === os && installer.format === PRIMARY_FORMAT[os],
  );
  const wanted: Arch = platform.arch === "unknown" ? (os === "macos" ? "arm64" : "x64") : platform.arch;
  const exact = candidates.find((installer) => installer.arch === wanted);
  const primary = exact ?? candidates.find((installer) => installer.arch === "x64") ?? candidates[0];
  const emulated = !exact && wanted === "arm64" && primary?.arch === "x64";
  const otherArch =
    os === "macos" ? candidates.find((installer) => primary && installer.arch !== primary.arch) : undefined;
  return { ...(primary ? { primary } : {}), ...(otherArch ? { otherArch } : {}), emulated };
}

export function formatSize(bytes: number | undefined): string {
  if (!bytes) return "";
  const mb = bytes / 1_000_000;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function archName(os: Os, arch: Arch): string {
  if (os === "macos") return arch === "arm64" ? "Apple silicon" : "Intel";
  return arch === "arm64" ? "ARM64" : "x64";
}

export function formatName(format: Format): string {
  switch (format) {
    case "exe":
      return "Installer (.exe)";
    case "msi":
      return "MSI package (.msi)";
    case "dmg":
      return "Disk image (.dmg)";
    case "AppImage":
      return "AppImage";
    case "deb":
      return "Debian/Ubuntu (.deb)";
    case "rpm":
      return "Fedora/RHEL (.rpm)";
  }
}
