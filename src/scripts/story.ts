/**
 * The home page's story. On load, the logo assembles itself (walls fold up, the floor slides
 * in, the people appear). Then a timeline scrubbed by ScrollTrigger walks through the chapters
 * while the stage stays pinned (CSS `position: sticky`): each chapter brings one part of the
 * logo forward and animates its details, while the matching text comes in beside it.
 *
 * Only transforms and opacity are animated (and stroke drawing inside the small SVG details).
 * With reduced motion, none of this runs: the page shows the still version.
 *
 * Timeline units: 0 is the hero, 1…6 the chapters. A chapter holds from `i` to `i + 0.65`,
 * then hands over to the next one until `i + 1`.
 */
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { chapters, STORY_STEPS } from "../components/home/story";

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

type Part = "wiki" | "tasks" | "history" | "team";
const PARTS: Part[] = ["wiki", "tasks", "history", "team"];

/** Where each part sits in the logo (percent of its box): scale origins and spotlight targets. */
const CENTER: Record<Part, [number, number]> = {
  wiki: [20.5, 43],
  tasks: [79.5, 43],
  history: [50, 33],
  team: [50, 76],
};

interface LayerState {
  opacity: number;
  scale: number;
  xPercent: number;
  yPercent: number;
}

const REST: LayerState = { opacity: 1, scale: 1, xPercent: 0, yPercent: 0 };
const DIM = 0.14;

/** The logo's layers at each step of the story. */
function layerStates(step: number): Record<Part, LayerState> {
  const all = (state: Partial<LayerState>) =>
    Object.fromEntries(PARTS.map((part) => [part, { ...REST, ...state }])) as Record<Part, LayerState>;
  const focus = (part: Part, offset: Partial<LayerState>) => ({
    ...all({ opacity: DIM, scale: 0.98 }),
    [part]: { ...REST, scale: 1.08, ...offset },
  });
  switch (step) {
    case 1: // One room: an exploded view, every part labelled.
      return {
        wiki: { ...REST, xPercent: -5, yPercent: -2 },
        tasks: { ...REST, xPercent: 5, yPercent: -2 },
        history: { ...REST, yPercent: -5 },
        team: { ...REST, yPercent: 4 },
      };
    case 2:
      return focus("wiki", { xPercent: -2, yPercent: -1 });
    case 3:
      return focus("history", { yPercent: -2 });
    case 4:
      return focus("tasks", { xPercent: 2, yPercent: -1 });
    case 5:
      return focus("team", { yPercent: 1.5 });
    case 6: // Plain files: the coloured logo gives way to the mono one.
      return all({ opacity: 0, scale: 0.82 });
    default:
      return all({});
  }
}

function spotState(step: number): { xPercent: number; yPercent: number; opacity: number } {
  const part = ([undefined, undefined, "wiki", "history", "tasks", "team"] as const)[step];
  // The spot is 46% of the logo wide and centred on its own origin, so percentages of the
  // logo become percentages of the spot by dividing by 0.46.
  const [x, y] = part ? CENTER[part] : [50, 50];
  return { xPercent: x / 0.46, yPercent: y / 0.46, opacity: part ? 1 : 0 };
}

export function initStory(): void {
  const story = document.querySelector<HTMLElement>("[data-story]");
  if (!story) return;

  const mm = gsap.matchMedia();
  mm.add(
    { motion: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" },
    (context) => {
      if (!context.conditions?.["motion"]) {
        story.classList.add("is-live");
        return;
      }
      return build(story, context);
    },
  );
}

function build(story: HTMLElement, context: gsap.Context): () => void {
  const $ = <T extends Element = HTMLElement>(selector: string) => story.querySelector<T>(selector)!;
  const $$ = <T extends Element = HTMLElement>(selector: string) => [...story.querySelectorAll<T>(selector)];

  const layer = (part: string) => $(`.logo__layer[data-layer="${part}"]`);
  const partEl = (part: Part) => $(`.logo__part[data-part="${part}"]`);
  const layers = Object.fromEntries(PARTS.map((part) => [part, layer(part)])) as Record<Part, HTMLElement>;
  const mono = layer("mono");
  const glow = $(".logo__glow");
  const spot = $("[data-logo-spot]");
  const hero = $("[data-hero]");
  const hint = $("[data-hint]");
  const progressBar = $("[data-progress]");
  const chapterEls = $$(".chapter");
  const railLinks = $$<HTMLAnchorElement>("[data-rail]");
  const labels = $$(".logo__label");
  const files = $$(".logo__file");
  const logoBox = $(".logo");

  const wikiLines = $$<SVGPathElement>("[data-wiki-line]");
  const branchLines = $$<SVGPathElement>("[data-branch-line]");
  const branchNodes = $$<SVGCircleElement>("[data-branch-node]");
  const taskChecks = $$<SVGPathElement>("[data-task-check]");
  const taskLines = $$<SVGPathElement>("[data-task-line]");
  const taskDone = $<SVGPathElement>("[data-task-done]");
  const people = $$<SVGGElement>("[data-person]");
  const agents = $$<SVGPathElement>("[data-agent]");

  for (const part of PARTS) {
    gsap.set(layers[part], { transformOrigin: `${CENTER[part][0]}% ${CENTER[part][1]}%` });
  }
  gsap.set(mono, { transformOrigin: "50% 50%" });

  /* ---------- The intro: the logo assembles itself ---------- */
  const startsAtTop = story.getBoundingClientRect().top >= -2;
  const intro = gsap.timeline({ defaults: { ease: "expo.out" }, paused: !startsAtTop });
  intro
    .from(glow, { opacity: 0, scale: 0.55, duration: 1.8, ease: "power2.out" }, 0)
    .from(partEl("team"), { yPercent: 16, opacity: 0, duration: 1.2 }, 0.05)
    .from(
      partEl("history"),
      { rotationX: 78, transformOrigin: "50% 58.4%", transformPerspective: 900, opacity: 0, duration: 1.3 },
      0.18,
    )
    .from(
      partEl("wiki"),
      { rotationY: -84, transformOrigin: "33.2% 50%", transformPerspective: 1000, opacity: 0, duration: 1.35 },
      0.3,
    )
    .from(
      partEl("tasks"),
      { rotationY: 84, transformOrigin: "66.8% 50%", transformPerspective: 1000, opacity: 0, duration: 1.35 },
      0.38,
    )
    .from(wikiLines, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.7, stagger: 0.07, ease: "power3.out" }, 0.9)
    .from(branchLines, { drawSVG: "0%", duration: 0.8, stagger: 0.3, ease: "power2.inOut" }, 0.75)
    .from(
      branchNodes,
      { scale: 0, transformOrigin: "50% 50%", duration: 0.55, stagger: 0.2, ease: "back.out(2.4)" },
      0.9,
    )
    .from(taskChecks, { drawSVG: "0%", duration: 0.45, stagger: 0.2, ease: "power2.out" }, 1.15)
    .from(taskLines, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.6, stagger: 0.08, ease: "power3.out" }, 1.05)
    .from(people, { scale: 0, transformOrigin: "50% 100%", duration: 0.7, stagger: 0.1, ease: "back.out(1.9)" }, 0.85);
  // The from-states are set: the logo may show now (the CSS kept it hidden until here).
  story.classList.add("is-live");
  if (startsAtTop) intro.play();
  else intro.progress(1);

  // The scroll story is built once the browser is idle, or at the first scroll or focus, so the
  // intro starts at once and the page stays responsive while it loads.
  let stopStory: (() => void) | undefined;
  const startStory = () => {
    cancelIdle();
    if (!stopStory) context.add(() => (stopStory = scrollStory()));
  };
  const idle =
    "requestIdleCallback" in window ? requestIdleCallback(startStory, { timeout: 1200 }) : setTimeout(startStory, 300);
  const cancelIdle = () => {
    if ("cancelIdleCallback" in window) cancelIdleCallback(idle);
    else clearTimeout(idle);
    window.removeEventListener("scroll", startStory);
    story.removeEventListener("focusin", startStory);
  };
  window.addEventListener("scroll", startStory, { passive: true });
  story.addEventListener("focusin", startStory);
  if (!startsAtTop) startStory();

  return () => {
    cancelIdle();
    stopStory?.();
    story.classList.remove("is-live");
  };

  /* ---------- The scroll story ---------- */
  function scrollStory(): () => void {
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut", immediateRender: false } });
    tl.set({}, {}, STORY_STEPS);

    // The logo's layers and the spotlight move from each step's state to the next.
    for (let step = 0; step < STORY_STEPS - 1; step++) {
      const from = layerStates(step);
      const to = layerStates(step + 1);
      const at = step + 0.6;
      for (const part of PARTS) {
        tl.fromTo(layers[part], from[part], { ...to[part], duration: 0.4, ease: "power3.inOut" }, at);
      }
      tl.fromTo(spot, spotState(step), { ...spotState(step + 1), duration: 0.4 }, at);
    }

    // Text: the hero hands over to chapter 1, each chapter to the next.
    const lines = (el: HTMLElement) =>
      el.matches("[data-hero]") ? [...el.children] : $$(`#${el.id} .chapter__text > *`);
    // Opacity only, never visibility: hidden chapters stay readable for screen readers and
    // reachable by keyboard (focusing one scrolls to it); the active one takes the pointer.
    const textIn = (el: HTMLElement, at: number) => {
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none" }, at);
      tl.fromTo(lines(el), { y: 36 }, { y: 0, duration: 0.24, stagger: 0.025, ease: "power3.out" }, at);
    };
    const textOut = (el: HTMLElement, at: number) => {
      tl.fromTo(el, { opacity: 1 }, { opacity: 0, duration: 0.18, ease: "none" }, at);
      tl.fromTo(lines(el), { y: 0 }, { y: -30, duration: 0.2, ease: "power2.in" }, at);
    };
    tl.fromTo(hint, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.15 }, 0.02);
    textOut(hero, 0.65);
    chapterEls.forEach((chapter, i) => {
      const step = i + 1;
      textIn(chapter, step - 0.2);
      if (step < STORY_STEPS - 1) textOut(chapter, step + 0.65);
    });

    // 1 · One room: labels name the parts of the exploded room.
    tl.fromTo(labels, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.18, stagger: 0.04 }, 0.68);
    tl.fromTo(labels, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.15 }, 1.6);

    // 2 · Docs: the wiki page's lines write themselves.
    tl.fromTo(wikiLines, { scaleX: 1 }, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.1, stagger: 0.01 }, 1.6);
    tl.fromTo(
      wikiLines,
      { scaleX: 0 },
      { scaleX: 1, transformOrigin: "0% 50%", duration: 0.2, stagger: 0.05, ease: "power2.out" },
      1.76,
    );

    // 3 · History: the branch draws its path and its commits pop up.
    tl.fromTo(branchLines, { drawSVG: "100%" }, { drawSVG: "0%", duration: 0.1 }, 2.6);
    tl.fromTo(branchNodes, { scale: 1 }, { scale: 0, transformOrigin: "50% 50%", duration: 0.1 }, 2.6);
    tl.fromTo(
      branchLines,
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 0.22, stagger: 0.1, ease: "power1.inOut" },
      2.74,
    );
    tl.fromTo(
      branchNodes,
      { scale: 0 },
      { scale: 1, transformOrigin: "50% 50%", duration: 0.14, stagger: 0.07, ease: "back.out(2.6)" },
      2.8,
    );

    // 4 · Tasks: the checkmarks tick, and the open task gets done.
    tl.fromTo(taskChecks, { drawSVG: "100%" }, { drawSVG: "0%", duration: 0.12 }, 3.6);
    tl.fromTo(taskLines, { scaleX: 1 }, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.12 }, 3.6);
    tl.fromTo(
      taskChecks,
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 0.14, stagger: 0.09, ease: "power2.out" },
      3.76,
    );
    tl.fromTo(
      taskLines,
      { scaleX: 0 },
      { scaleX: 1, transformOrigin: "0% 50%", duration: 0.18, stagger: 0.05, ease: "power2.out" },
      3.76,
    );
    tl.fromTo(
      taskDone,
      { opacity: 0, drawSVG: "0%" },
      { opacity: 1, drawSVG: "100%", duration: 0.14, ease: "power2.out" },
      4.0,
    );
    tl.fromTo(taskDone, { opacity: 1 }, { opacity: 0, duration: 0.12 }, 4.62);

    // 5 · Team & agents: the people step in, then the agents join them.
    tl.fromTo(people, { scale: 1 }, { scale: 0, transformOrigin: "50% 100%", duration: 0.14 }, 4.6);
    tl.fromTo(
      people,
      { scale: 0 },
      { scale: 1, transformOrigin: "50% 100%", duration: 0.18, stagger: 0.06, ease: "back.out(2)" },
      4.76,
    );
    tl.fromTo(
      agents,
      { opacity: 0, scale: 0, rotation: -90 },
      {
        opacity: 1,
        scale: 1,
        rotation: 0,
        transformOrigin: "50% 50%",
        duration: 0.2,
        stagger: 0.06,
        ease: "back.out(2)",
      },
      4.98,
    );
    tl.fromTo(agents, { opacity: 1 }, { opacity: 0, duration: 0.12 }, 5.62);

    // 6 · Plain files: the mono logo, and the files it is made of float out.
    tl.fromTo(mono, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 0.7, duration: 0.4, ease: "power3.inOut" }, 5.6);
    tl.fromTo(
      files,
      {
        autoAlpha: 0,
        scale: 0.6,
        x: (_: number, el: HTMLElement) =>
          ((50 - parseFloat(el.style.getPropertyValue("--x"))) / 100) * logoBox.offsetWidth,
        y: (_: number, el: HTMLElement) =>
          ((50 - parseFloat(el.style.getPropertyValue("--y"))) / 100) * logoBox.offsetHeight,
      },
      { autoAlpha: 1, scale: 1, x: 0, y: 0, duration: 0.3, stagger: 0.04, ease: "power3.out" },
      5.68,
    );

    tl.fromTo(progressBar, { scaleX: 0 }, { scaleX: 1, duration: STORY_STEPS, ease: "none" }, 0);

    /* ---------- Scroll, rail and keyboard ---------- */
    let active = -1;
    const setActive = (index: number) => {
      if (index === active) return;
      active = index;
      story.dataset.chapter = String(index);
      [hero, ...chapterEls].forEach((el, i) => el.classList.toggle("is-active", i === index));
      railLinks.forEach((link, i) => {
        if (i + 1 === index) link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      });
    };

    const trigger = ScrollTrigger.create({
      trigger: story,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      animation: tl,
      invalidateOnRefresh: true,
      onUpdate(self) {
        if (self.progress > 0.002 && intro.progress() < 1) intro.progress(1);
        const t = self.progress * STORY_STEPS;
        setActive(Math.min(chapters.length, Math.floor(t + 0.175)));
      },
    });
    setActive(Math.min(chapters.length, Math.floor(trigger.progress * STORY_STEPS + 0.175)));

    /** Scrolls to the middle of a step's hold. */
    const scrollToStep = (step: number, behavior: ScrollBehavior) => {
      const t = step === 0 ? 0 : step + 0.25;
      const y = trigger.start + (t / STORY_STEPS) * (trigger.end - trigger.start);
      window.scrollTo({ top: y, behavior });
    };

    const onRail = (event: Event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>("[data-rail]");
      if (!link) return;
      event.preventDefault();
      scrollToStep(Number(link.dataset["rail"]), "smooth");
    };
    // Keyboard users reach links in chapters that aren't showing: bring their chapter in.
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element;
      if (target.closest(".story__rail")) return;
      const chapter = target.closest<HTMLElement>(".chapter");
      const step = chapter ? Number(chapter.dataset["chapterIndex"]) : target.closest("[data-hero]") ? 0 : -1;
      if (step >= 0 && step !== active) scrollToStep(step, "instant");
    };
    story.addEventListener("click", onRail);
    story.addEventListener("focusin", onFocus);
    // The focus that started the story is past; handle it now.
    if (document.activeElement && story.contains(document.activeElement)) {
      onFocus({ target: document.activeElement } as unknown as FocusEvent);
    }

    return () => {
      story.removeEventListener("click", onRail);
      story.removeEventListener("focusin", onFocus);
      story.dataset.chapter = "0";
      [hero, ...chapterEls].forEach((el) => el.classList.remove("is-active"));
    };
  }
}
