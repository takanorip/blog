import type { BatchWriteParams } from "algoliasearch";
import { searchClient } from "@algolia/client-search";
import contactsJSON from "../_site/index.json";

const INDEX_NAME = "blog";

(async function () {
  const key = process.env.ALGOLIA_API_KEY;
  if (!key) {
    throw new Error("No Algolia API key found");
  }
  const requests = contactsJSON as BatchWriteParams["requests"];
  if (requests.length === 0) {
    throw new Error("_site/index.json has no posts; refusing to sync the index");
  }
  const client = searchClient("T3J60MBUA8", key);
  const response = await client.batch({
    indexName: INDEX_NAME,
    batchWriteParams: { requests },
  });
  console.log(response);

  // Unpublished (draft) and deleted posts are missing from the build output,
  // so anything left in the index that the build didn't produce is stale.
  try {
    const current = new Set(requests.map((r) => String(r.body.objectID)));
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
})();
