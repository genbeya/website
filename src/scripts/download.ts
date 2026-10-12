/**
 * The download page: finds out which system the visitor is on (in the browser, from what it
 * tells about itself; nothing is sent anywhere) and shows the matching installer first.
 * Without JavaScript the page lists every installer and asks the visitor to choose.
 */
import {
  pickInstaller,
  type Arch,
  type Format,
  type Installer,
  type Os,
  type Platform,
  type Variant,
} from "../lib/downloads";
import { detectPlatform, detectPlatformDetailed, type NavigatorLike } from "../lib/platform";

/** The installers, read back from the table the page was built with. */
function installersOnPage(): Installer[] {
  return [...document.querySelectorAll<HTMLElement>("tr[data-installer]")].map((row) => {
    const data = row.dataset;
    return {
      name: data["installer"]!,
      url: data["url"]!,
      variant: data["variant"] as Variant,
      os: data["os"] as Os,
      arch: data["arch"] as Arch,
      format: data["format"] as Format,
      ...(data["size"] ? { size: Number(data["size"]) } : {}),
    };
  });
}

function show(pick: HTMLElement, key: string): void {
  let shown = false;
  for (const card of pick.querySelectorAll<HTMLElement>("[data-pick-for]")) {
    const match = card.dataset["pickFor"] === key;
    card.hidden = !match;
    shown ||= match;
  }
  if (!shown) pick.querySelector<HTMLElement>('[data-pick-for="unknown"]')!.hidden = false;
}

function apply(platform: Platform): void {
  const pick = document.querySelector<HTMLElement>("[data-pick]");
  if (!pick) return;
  document.documentElement.dataset["platform"] = `${platform.os}-${platform.arch}${platform.mobile ? "-mobile" : ""}`;

  if (platform.mobile) return show(pick, "mobile");
  const result = pickInstaller(installersOnPage(), platform);
  if (!result.primary) return show(pick, "unknown");

  show(pick, result.primary.name);
  const card = pick.querySelector<HTMLElement>(`[data-pick-for="${CSS.escape(result.primary.name)}"]`);
  const emulated = card?.querySelector<HTMLElement>("[data-emulated]");
  if (emulated) emulated.hidden = !result.emulated;

  for (const row of document.querySelectorAll<HTMLElement>("tr[data-installer]")) {
    row.classList.toggle("is-pick", row.dataset["installer"] === result.primary.name);
  }
  for (const group of document.querySelectorAll<HTMLElement>("tbody[data-os]")) {
    const yours = group.querySelector<HTMLElement>("[data-yours]");
    if (yours) yours.hidden = group.dataset["os"] !== platform.os;
  }
}

export function initDownloadPage(nav: NavigatorLike = navigator as unknown as NavigatorLike): void {
  // Synchronous first, so the right card shows at once; then the processor, where Chromium tells it.
  const quick = detectPlatform(nav);
  apply(quick);
  void detectPlatformDetailed(nav).then((detailed) => {
    if (detailed.arch !== quick.arch || detailed.os !== quick.os) apply(detailed);
  });
}
