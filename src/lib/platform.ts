/**
 * Which system a visitor is on, from what the browser tells about itself: User-Agent Client
 * Hints where available (Chromium), else the user-agent string. Nothing leaves the browser.
 */
import type { Arch, Os, Platform } from "./downloads";

/** The parts of `navigator` that detection reads; a plain object in tests. */
export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>;
  };
}

function osFromHint(platform: string): Os | "unknown" {
  const name = platform.toLowerCase();
  if (name === "windows") return "windows";
  if (name === "macos") return "macos";
  if (name === "linux" || name === "chrome os" || name === "chromeos") return "linux";
  return "unknown";
}

function osFromUserAgent(ua: string): Os | "unknown" {
  if (/Windows NT|Win64|Win32/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return "macos";
  if (/Linux|X11|CrOS/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "unknown";
}

function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function archFromUserAgent(ua: string, os: Os | "unknown"): Arch | "unknown" {
  // Every Mac browser says "Intel Mac OS X", Apple silicon ones too: the string can't tell.
  if (os === "macos") return "unknown";
  if (/aarch64|arm64|armv8/i.test(ua)) return "arm64";
  if (/x86_64|x64|Win64|WOW64|amd64/i.test(ua)) return "x64";
  return "unknown";
}

/** Detection from the synchronous information: enough for everything but a Mac's processor. */
export function detectPlatform(nav: NavigatorLike): Platform {
  const ua = nav.userAgent ?? "";
  const hinted = nav.userAgentData?.platform ? osFromHint(nav.userAgentData.platform) : "unknown";
  const os = hinted !== "unknown" ? hinted : osFromUserAgent(ua);
  // iPadOS asks for desktop sites and reports a Mac; touch gives it away.
  const iPad = os === "macos" && (nav.maxTouchPoints ?? 0) > 1;
  const mobile = nav.userAgentData?.mobile === true || isMobileUserAgent(ua) || iPad;
  if (mobile) return { os: "unknown", arch: "unknown", mobile: true };
  return { os, arch: archFromUserAgent(ua, os), mobile: false };
}

/** Maps Client Hints' `architecture` ("arm", "x86") and `bitness` to an installer architecture. */
export function archFromHints(architecture: string | undefined, bitness?: string): Arch | "unknown" {
  if (!architecture) return "unknown";
  if (architecture === "arm") return bitness === "32" ? "unknown" : "arm64";
  if (architecture === "x86") return bitness === "32" ? "unknown" : "x64";
  return "unknown";
}

/**
 * Detection including the processor, where the browser offers it (Chromium's high-entropy
 * Client Hints). Falls back to the synchronous result.
 */
export async function detectPlatformDetailed(nav: NavigatorLike): Promise<Platform> {
  const platform = detectPlatform(nav);
  const getHints = nav.userAgentData?.getHighEntropyValues;
  if (platform.mobile || platform.os === "unknown" || !getHints) return platform;
  try {
    const hints = await getHints.call(nav.userAgentData, ["architecture", "bitness"]);
    const arch = archFromHints(hints.architecture, hints.bitness);
    return arch === "unknown" ? platform : { ...platform, arch };
  } catch {
    return platform;
  }
}
