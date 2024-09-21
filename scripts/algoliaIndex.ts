import { BatchWriteParams, searchClient } from "algoliasearch";
import contactsJSON from "../_site/index.json";

(async function () {
  const key = process.env.ALGOLIA_API_KEY;
  if (!key) {
    throw new Error("No Algolia API key found");
  }
  const client = searchClient("T3J60MBUA8", key);
  const response = await client.batch({
    indexName: "blog",
    batchWriteParams: {
      requests: contactsJSON as BatchWriteParams["requests"],
    },
  });
  console.log(response);
})();
