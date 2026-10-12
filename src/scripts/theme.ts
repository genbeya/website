/** The theme toggles: flip between dark and light for this page view, without storing anything. */

type Theme = "dark" | "light";

const root = document.documentElement;
const current = (): Theme => (root.dataset.theme === "light" ? "light" : "dark");

function label(): void {
  const next = current() === "dark" ? "light" : "dark";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
    button.setAttribute("aria-label", `Switch to the ${next} theme`);
  }
}

let started = false;

export function initThemeToggles(): void {
  if (started) return;
  started = true;
  label();
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest("[data-theme-toggle]");
    if (!button) return;
    // From now on the visitor's choice wins over the system's preference, until the next page load.
    root.setAttribute("data-theme-chosen", "");
    root.dataset.theme = current() === "dark" ? "light" : "dark";
    label();
    document.dispatchEvent(new CustomEvent("themechange", { detail: current() }));
  });
  // The system's preference can change while nothing was chosen; keep the labels right.
  new MutationObserver(label).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}
