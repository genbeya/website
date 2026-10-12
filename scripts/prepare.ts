/**
 * Runs before `npm run dev` and `npm run build`: makes sure the inputs that come from the app
 * repository exist. Whatever is there already (synced by hand or by CI) is left alone.
 *   - docs: synced from ../genbeya when it is there, else a placeholder page
 *   - demo: the local bundle when there is one, else a placeholder
 *   - release data: none needed; without src/generated/release.json the sample in src/data is used
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { generatedDir, log } from "./lib/cli.ts";
import { syncDemo } from "./sync-demo.ts";
import { syncDocs, writePlaceholder } from "./sync-docs.ts";

if (!existsSync(path.join(generatedDir, "docs-index.json"))) {
  try {
    syncDocs(new Map());
  } catch (error) {
    log("prepare", (error as Error).message);
    writePlaceholder();
  }
}
syncDemo(new Map([["if-missing", true]]));
