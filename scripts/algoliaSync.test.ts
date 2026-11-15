import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { shouldSyncAlgolia } from "./algoliaSync";

test("syncs Algolia on the production branch and local builds", () => {
  assert.equal(shouldSyncAlgolia({}), true);
  assert.equal(shouldSyncAlgolia({ CF_PAGES: "1", CF_PAGES_BRANCH: "master" }), true);
  assert.equal(shouldSyncAlgolia({ CF_PAGES: "1" }), true);
});

test("skips Algolia on Cloudflare Pages preview branches", () => {
  assert.equal(
    shouldSyncAlgolia({ CF_PAGES: "1", CF_PAGES_BRANCH: "cursor/ibm-plex-sans-jp-743e" }),
    false,
  );
});

test("a preview build exits successfully without an Algolia key", () => {
  const result = spawnSync("npx", ["tsx", "scripts/algoliaIndex.ts"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "cursor/ibm-plex-sans-jp-743e",
      ALGOLIA_API_KEY: "",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping Algolia sync for preview branch cursor\/ibm-plex-sans-jp-743e/);
});

test("a production build still fails when the Algolia key is missing", () => {
  const result = spawnSync("npx", ["tsx", "scripts/algoliaIndex.ts"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "master",
      ALGOLIA_API_KEY: "",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /No Algolia API key found/);
});
