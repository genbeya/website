/**
 * Fades sections in as they scroll into view: opacity and a short rise, nothing else.
 * Only with motion allowed and JavaScript running; otherwise everything is simply there.
 */
export function initReveal(): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  for (const item of items) {
    // Already on screen (e.g. after a reload halfway down): show without a transition.
    if (item.getBoundingClientRect().top < innerHeight * 0.92) item.classList.add("is-revealed", "is-instant");
    else observer.observe(item);
  }
  document.documentElement.classList.add("reveal-ready");
}
