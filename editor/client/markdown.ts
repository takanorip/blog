import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
// @ts-expect-error: no type definitions
import markdownItTableOfContents from "@takanorip/markdown-it-table-of-contents";
// @ts-expect-error: no type definitions
import iterator from "markdown-it-for-inline";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-diff";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Keep in sync with the markdown-it setup in .eleventy.js.
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  highlight: (code, lang) => {
    const grammar = lang ? Prism.languages[lang] : undefined;
    const body = grammar ? Prism.highlight(code, grammar, lang) : escapeHtml(code);
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    return `<pre${cls}><code${cls}>${body}</code></pre>`;
  },
})
  .use(markdownItAnchor)
  .use(markdownItTableOfContents, {
    includeLevel: [1, 2, 3],
    containerTag: "details",
    containerHeaderHtml: '<summary class="toc-container-header">TOC</summary>',
  })
  .use(iterator, "url_new_win", "link_open", (tokens: any[], idx: number) => {
    tokens[idx].attrPush(["target", "_blank"]);
    tokens[idx].attrPush(["rel", "noopener noreferrer"]);
  })
  .use(iterator, "lazy_loading", "image", (tokens: any[], idx: number) => {
    tokens[idx].attrSet("loading", "lazy");
  });

export const renderMarkdown = (body: string) => md.render(body);

export { escapeHtml };
