import { algoliasearch } from "algoliasearch";
import records from "../_site/index.json";

const APP_ID = "T3J60MBUA8";
const INDEX_NAME = "blog";

const key = process.env.ALGOLIA_API_KEY;
if (!key) {
  throw new Error("No Algolia API key found");
}
if (records.length === 0) {
  throw new Error("_site/index.json has no posts; refusing to sync the index");
}

const client = algoliasearch(APP_ID, key);

const updated = await client.partialUpdateObjects({
  indexName: INDEX_NAME,
  objects: records,
  createIfNotExists: true,
});
console.log(`Updated ${records.length} record(s) in Algolia`, updated);

// Unpublished (draft) and deleted posts are missing from the build output,
// so anything left in the index that the build didn't produce is stale.
try {
  const current = new Set(records.map((record) => record.objectID));
  const indexed: string[] = [];
  await client.browseObjects<{ objectID: string }>({
    indexName: INDEX_NAME,
    browseParams: { attributesToRetrieve: ["objectID"], hitsPerPage: 1000 },
    aggregator: (res) => {
      indexed.push(...res.hits.map((hit) => hit.objectID));
    },
  });
  const stale = indexed.filter((id) => !current.has(id));
  if (stale.length > 0) {
    await client.deleteObjects({ indexName: INDEX_NAME, objectIDs: stale });
  }
  console.log(`Removed ${stale.length} stale record(s) from Algolia`, stale);
} catch (e) {
  // Keep deploying even if cleanup fails (e.g. the key lacks the browse /
  // deleteObject ACLs); stale records only affect search results.
  console.warn(
    "Failed to remove stale Algolia records. The API key needs the browse and deleteObject ACLs.",
    e,
  );
}
