import { describe, expect, it } from "vitest";
import { archFromHints, detectPlatform, detectPlatformDetailed, type NavigatorLike } from "../../src/lib/platform.ts";

/** User agents of real browsers. */
export const UA = {
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  linuxArm: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
};

describe("detectPlatform", () => {
  it("recognises Windows, macOS and Linux from the user agent", () => {
    expect(detectPlatform({ userAgent: UA.windowsChrome })).toEqual({ os: "windows", arch: "x64", mobile: false });
    expect(detectPlatform({ userAgent: UA.windowsFirefox })).toEqual({ os: "windows", arch: "x64", mobile: false });
    expect(detectPlatform({ userAgent: UA.linuxFirefox })).toEqual({ os: "linux", arch: "x64", mobile: false });
    expect(detectPlatform({ userAgent: UA.linuxArm })).toEqual({ os: "linux", arch: "arm64", mobile: false });
  });

  it("can't tell a Mac's processor from the user agent, which always says Intel", () => {
    expect(detectPlatform({ userAgent: UA.macSafari })).toEqual({ os: "macos", arch: "unknown", mobile: false });
  });

  it("prefers Client Hints for the system", () => {
    const nav: NavigatorLike = { userAgent: UA.windowsChrome, userAgentData: { platform: "macOS", mobile: false } };
    expect(detectPlatform(nav).os).toBe("macos");
  });

  it("recognises phones and tablets, including iPads that ask for desktop sites", () => {
    expect(detectPlatform({ userAgent: UA.android }).mobile).toBe(true);
    expect(detectPlatform({ userAgent: UA.iphone }).mobile).toBe(true);
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 5 }).mobile).toBe(true);
    expect(
      detectPlatform({ userAgent: UA.linuxFirefox, userAgentData: { platform: "Linux", mobile: true } }).mobile,
    ).toBe(true);
  });

  it("gives up on anything else", () => {
    expect(detectPlatform({ userAgent: "curl/8.0" })).toEqual({ os: "unknown", arch: "unknown", mobile: false });
  });
});

describe("archFromHints", () => {
  it("maps Client Hints' architecture to an installer's", () => {
    expect(archFromHints("arm", "64")).toBe("arm64");
    expect(archFromHints("x86", "64")).toBe("x64");
    expect(archFromHints("x86", "32")).toBe("unknown");
    expect(archFromHints(undefined)).toBe("unknown");
  });
});

describe("detectPlatformDetailed", () => {
  const macChromium = (architecture: string): NavigatorLike => ({
    userAgent: UA.macChrome,
    userAgentData: {
      platform: "macOS",
      mobile: false,
      getHighEntropyValues: async () => ({ architecture, bitness: "64" }),
    },
  });

  it("asks Chromium for a Mac's processor", async () => {
    expect(await detectPlatformDetailed(macChromium("arm"))).toEqual({ os: "macos", arch: "arm64", mobile: false });
    expect(await detectPlatformDetailed(macChromium("x86"))).toEqual({ os: "macos", arch: "x64", mobile: false });
  });

  it("falls back when the browser doesn't tell", async () => {
    expect(await detectPlatformDetailed({ userAgent: UA.macSafari })).toEqual({
      os: "macos",
      arch: "unknown",
      mobile: false,
    });
    const failing: NavigatorLike = {
      userAgent: UA.macChrome,
      userAgentData: { platform: "macOS", getHighEntropyValues: () => Promise.reject(new Error("denied")) },
    };
    expect(await detectPlatformDetailed(failing)).toEqual({ os: "macos", arch: "unknown", mobile: false });
  });
});
