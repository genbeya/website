import { defineCollection } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

export const collections = {
  /** The documentation: the app repository's wiki, synced into src/content/docs/docs/ by `npm run sync-docs`. */
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  /** Starlight's interface texts, where the site words them differently. */
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
