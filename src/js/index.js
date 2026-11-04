const { liteClient } = window["algoliasearch/lite"];
const { configure, searchBox, poweredBy, hits, pagination } =
  instantsearch.widgets;

const search = instantsearch({
  indexName: "blog",
  searchClient: liteClient("T3J60MBUA8", "8f49853dd7e9830263fdea7ff69497ee"),
});

search.addWidgets([
  configure({
    attributesToSnippet: ["body:40"],
    snippetEllipsisText: "[…]",
  }),
  searchBox({
    container: "#searchbox",
    placeholder: "Search posts",
    autofocus: true,
  }),
  poweredBy({
    container: "#poweredby",
  }),
  hits({
    container: "#hits",
    templates: {
      item: (hit, { html, components }) => html`
        <a class="takanorip-hitLink" href="${hit.url}">
          <p class="takanorip-hitName">
            ${components.Highlight({ hit, attribute: "title" })}
          </p>
          <p class="takanorip-hitExcerpt">
            ${components.Snippet({ hit, attribute: "body" })}
          </p>
        </a>
      `,
    },
  }),
  pagination({
    container: "#pagination",
  }),
]);

search.start();
