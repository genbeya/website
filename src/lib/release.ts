/**
 * The release the download page offers: src/generated/release.json, which CI writes from the
 * GitHub API at build time (`npm run fetch-release`), else the sample in src/data for local work.
 */
import { site } from "../data/site";
import sample from "../data/release.sample.json";
import { toRelease, type Release, type ReleaseData } from "./downloads";

const generated = import.meta.glob<ReleaseData>("../generated/release.json", { eager: true, import: "default" });

export const releaseData: ReleaseData = Object.values(generated)[0] ?? (sample as ReleaseData);

export const release: Release | null = toRelease(releaseData, site.repository);

/** Whether the release ships the browser demo (genbeya-web-demo.zip). */
export const releaseHasDemo =
  releaseData.release?.assets.some((asset) => asset.name === "genbeya-web-demo.zip") ?? false;
