import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
// @ts-expect-error: no type definitions
import markdownItTableOfContents from "@takanorip/markdown-it-table-of-contents";
// @ts-expect-error: no type definitions
import iterator from "markdown-it-for-inline";
import Prism from "prismjs";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-django";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

const ALIASES: Record<string, string> = { njk: "jinja2", nunjucks: "jinja2" };

const grammarFor = (language: string) => {
  if (language.startsWith("diff-")) return Prism.languages.diff;
  return Prism.languages[ALIASES[language] ?? language];
};

// Mirrors @11ty/eleventy-plugin-syntaxhighlight's markdown highlighter so the
// preview produces the same markup as the published page (including leaving
// unknown languages unescaped, as the plugin does).
const highlight = (code: string, info: string) => {
  if (!info) return "";
  const language = info.split("/")[0];
  let html = code;
  if (language !== "text") {
    const grammar = grammarFor(language);
    if (grammar) html = Prism.highlight(code, grammar, language);
  }
  let lines = html.split("\n");
  if (lines[lines.length - 1] === "") lines = lines.slice(0, -1);
  const cls = ` class="language-${language}"`;
  return `<pre${cls}><code${cls}>${lines.join("\n")}</code></pre>`;
};

// Keep in sync with the markdown-it setup in .eleventy.js.
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  highlight,
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
