import { describe, expect, it } from "vitest";
import sample from "../../src/data/release.sample.json";
import {
  archName,
  downloadUrl,
  formatSize,
  parseInstallerName,
  pickInstaller,
  toRelease,
  type ReleaseData,
} from "../../src/lib/downloads.ts";

const repository = "https://github.com/genbeya/genbeya";
const release = toRelease(sample as ReleaseData, repository)!;
const names = (installer: { name: string } | undefined) => installer?.name;

describe("parseInstallerName", () => {
  it("reads the release's installer names", () => {
    expect(parseInstallerName("Genbeya-0.0.1-electron-windows-x64-setup.exe")).toEqual({
      name: "Genbeya-0.0.1-electron-windows-x64-setup.exe",
      variant: "electron",
      os: "windows",
      arch: "x64",
      format: "exe",
    });
    expect(parseInstallerName("Genbeya-1.2.3-tauri-linux-x64.rpm")).toMatchObject({ variant: "tauri", format: "rpm" });
    expect(parseInstallerName("Genbeya-1.2.3-deno-macos-arm64.dmg")).toMatchObject({ os: "macos", arch: "arm64" });
  });

  it("ignores other assets", () => {
    expect(parseInstallerName("genbeya-web-demo.zip")).toBeNull();
    expect(parseInstallerName("Genbeya-1.2.3-electron-windows-x64.exe.blockmap")).toBeNull();
    expect(parseInstallerName("checksums.txt")).toBeNull();
  });
});

describe("toRelease", () => {
  it("links every installer to the release's download URL", () => {
    expect(release.version).toBe("0.0.1");
    expect(release.sample).toBe(true);
    expect(release.installers).toHaveLength(14);
    expect(release.installers[0]).toMatchObject({
      name: "Genbeya-0.0.1-electron-windows-x64-setup.exe",
      url: "https://github.com/genbeya/genbeya/releases/download/v0.0.1/Genbeya-0.0.1-electron-windows-x64-setup.exe",
    });
  });

  it("orders installers by variant, system and architecture, Apple silicon first", () => {
    const electron = release.installers.filter((installer) => installer.variant === "electron").map((i) => i.name);
    expect(electron).toEqual([
      "Genbeya-0.0.1-electron-windows-x64-setup.exe",
      "Genbeya-0.0.1-electron-macos-arm64.dmg",
      "Genbeya-0.0.1-electron-macos-x64.dmg",
      "Genbeya-0.0.1-electron-linux-x64.AppImage",
    ]);
  });

  it("has no release before the first one", () => {
    expect(toRelease({ release: null }, repository)).toBeNull();
  });
});

describe("pickInstaller", () => {
  const pick = (os: "windows" | "macos" | "linux" | "unknown", arch: "x64" | "arm64" | "unknown" = "unknown") =>
    pickInstaller(release.installers, { os, arch, mobile: false });

  it("offers the Electron installer in each system's main format", () => {
    expect(names(pick("windows", "x64").primary)).toBe("Genbeya-0.0.1-electron-windows-x64-setup.exe");
    expect(names(pick("linux", "x64").primary)).toBe("Genbeya-0.0.1-electron-linux-x64.AppImage");
  });

  it("defaults Macs to Apple silicon, with the Intel build as the alternative", () => {
    const mac = pick("macos");
    expect(names(mac.primary)).toBe("Genbeya-0.0.1-electron-macos-arm64.dmg");
    expect(names(mac.otherArch)).toBe("Genbeya-0.0.1-electron-macos-x64.dmg");
  });

  it("offers Intel Macs the Intel build", () => {
    const mac = pick("macos", "x64");
    expect(names(mac.primary)).toBe("Genbeya-0.0.1-electron-macos-x64.dmg");
    expect(names(mac.otherArch)).toBe("Genbeya-0.0.1-electron-macos-arm64.dmg");
  });

  it("offers ARM Windows and Linux the x64 build, which runs emulated", () => {
    const arm = pick("windows", "arm64");
    expect(names(arm.primary)).toBe("Genbeya-0.0.1-electron-windows-x64-setup.exe");
    expect(arm.emulated).toBe(true);
    expect(pick("windows", "x64").emulated).toBe(false);
  });

  it("picks other variants when asked", () => {
    const tauri = pickInstaller(release.installers, { os: "macos", arch: "x64", mobile: false }, "tauri");
    expect(names(tauri.primary)).toBe("Genbeya-0.0.1-tauri-macos-arm64.dmg");
  });

  it("offers nothing for unknown systems", () => {
    expect(pick("unknown").primary).toBeUndefined();
  });
});

describe("formatting", () => {
  it("formats sizes and architectures", () => {
    expect(formatSize(112_000_000)).toBe("112 MB");
    expect(formatSize(7_900_000)).toBe("7.9 MB");
    expect(formatSize(undefined)).toBe("");
    expect(archName("macos", "arm64")).toBe("Apple silicon");
    expect(archName("windows", "x64")).toBe("x64");
  });

  it("encodes download URLs", () => {
    expect(downloadUrl(repository, "v1.0.0", "a b.exe")).toBe(
      "https://github.com/genbeya/genbeya/releases/download/v1.0.0/a%20b.exe",
    );
  });
});
