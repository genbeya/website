import { describe, expect, it } from "vitest";
import { findPlanBlocks } from "../../scripts/lib/plans.ts";

describe("findPlanBlocks", () => {
  it("finds the plan blocks the app can draw, each a paragraph of its own", () => {
    const page = [
      "# Plan",
      "",
      "[EFFORT milestone=MVP]",
      "",
      '[GANTT epic="Release 1.0"]',
      "",
      "[DEPENDENCIES]",
      "[ARROWS]",
      "",
      "See [FLOAT] in text.",
      "",
      "[BURNDOWN]",
      "",
      "[EFFORT milestone=MVP]",
    ].join("\n");
    expect(findPlanBlocks(page)).toEqual(["[EFFORT milestone=MVP]", '[GANTT epic="Release 1.0"]']);
  });

  it("leaves out blocks inside code", () => {
    const page = [
      "```markdown",
      "",
      "[EFFORT]",
      "",
      "```",
      "",
      "~~~",
      "",
      "[FLOAT]",
      "",
      "~~~",
      "",
      "[ARROWS]",
      "",
    ].join("\n");
    expect(findPlanBlocks(page)).toEqual(["[ARROWS]"]);
  });
});
