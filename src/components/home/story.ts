/** The chapters of the home page's scroll story, shared by the markup and the animation. */

export type StoryPart = "room" | "wiki" | "history" | "tasks" | "team" | "files";

export interface Chapter {
  id: string;
  part: StoryPart;
  /** Short name for the chapter rail. */
  short: string;
  eyebrow: string;
  title: string;
  body: string;
}

export const chapters: Chapter[] = [
  {
    id: "one-room",
    part: "room",
    short: "One room",
    eyebrow: "The obeya",
    title: "Everything in one room",
    body: "In lean, the obeya is the big room where plans, tasks, problems and status hang on the walls for everyone to see. Genbeya builds that room inside your repository: a wiki, a task board, a code editor, Git tools and a terminal, in one window.",
  },
  {
    id: "docs",
    part: "wiki",
    short: "Docs",
    eyebrow: "The wiki wall",
    title: "Docs that live with the code",
    body: "Your wiki is Markdown in docs/, next to the code it explains — changed in the same commit, reviewed in the same pull request. References link pages, tasks and lines of code, and always show their current title and status.",
  },
  {
    id: "history",
    part: "history",
    short: "History",
    eyebrow: "The back wall",
    title: "History you can trust",
    body: "Every page, task and decision is versioned by Git: see who changed what and why, review it like code, and take back anything. And Genbeya is a full Git client — stage single lines, rebase interactively, resolve conflicts.",
  },
  {
    id: "tasks",
    part: "tasks",
    short: "Tasks",
    eyebrow: "The task wall",
    title: "Tasks in plain files",
    body: "One Markdown file per task, with a readable ID and front matter. Plan on a board or a list, with epics, custom fields and comments — and grep, diff and merge your backlog like everything else.",
  },
  {
    id: "team",
    part: "team",
    short: "Team & agents",
    eyebrow: "The floor",
    title: "Your team, and your AI agents",
    body: "Everyone works in the same room — your coding agents too. They read the same docs and tasks you do, and a skill and an AGENTS.md section teach Claude Code, Codex, Copilot and Cursor to track their work as tasks and keep knowledge in the wiki.",
  },
  {
    id: "no-lock-in",
    part: "files",
    short: "No lock-in",
    eyebrow: "Plain files",
    title: "Plain files, no lock-in",
    body: "No server, no account, no database. It is Markdown and YAML in your repository, so it works with any Git host, any editor and any tool — today and in ten years.",
  },
];

/** Scroll-timeline units: the hero, then one per chapter. */
export const STORY_STEPS = chapters.length + 1;
