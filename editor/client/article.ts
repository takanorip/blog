import { parseFrontMatter, splitFrontMatter } from "../shared/frontmatter";
import { escapeHtml, renderMarkdown } from "./markdown";

// The preview document mirrors src/_includes/layouts/blogBase.njk so the
// published stylesheets apply exactly as they do on the site.
export const previewDocument = (origin: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<base href="${origin}/" target="_blank">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/index.css">
<link rel="stylesheet" href="/css/prism.css">
</head>
<body class="blog-content takanorip-blogBase"><main class="takanorip-contents"></main></body>
</html>`;

const parseTags = (block: string | null) => {
  if (!block) return [];
  const inline = block.match(/^tags:\s*\[(.*)\]\s*$/m);
  const raw = inline
    ? inline[1].split(",")
    : (block.match(/^tags:\s*\r?\n((?:[ \t]+-.*(?:\r?\n|$))+)/m)?.[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*-\s*/, "")) ??
      [block.match(/^tags:[ \t]*(\S.*)$/m)?.[1] ?? ""]);
  return raw
    .map((tag) => tag.trim().replace(/^(["'])(.*)\1$/, "$2"))
    .filter((tag) => tag && tag !== "blog");
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
};

// Same pattern as eleventy-plugin-embed-twitter. The site fetches the tweet
// text at build time; the preview can only show the link.
const TWEET =
  /<p>(?=(\s*))\1(?:<a [^>]*?>)??(?=(\s*))\2(?:https?:)??(?:\/\/)??(?:w{3}\.)??(?:(?:twitter|x)\.com)\/([a-zA-Z0-9_]{1,15})?(?:\/(?:status)\/)(\d+)?(?:[^\s<>]*)(?=(\s*))\5(?:<\/a>)??(?=(\s*))\6<\/p>/g;

const embedTweets = (html: string) =>
  html.replace(TWEET, (_, _s1, _s2, user: string, id: string) => {
    const url = `https://twitter.com/${user}/status/${id}`;
    return `<div class="eleventy-plugin-embed-twitter"><blockquote class="twitter-tweet"><a href="${url}">${url}</a></blockquote></div>`;
  });

// Mirrors the article part of src/_includes/layouts/blog.njk.
export const renderArticle = (content: string) => {
  const { block, body } = splitFrontMatter(content);
  const { title, date } = parseFrontMatter(content);
  const tags = parseTags(block)
    .map(
      (tag) =>
        `<li class="takanorip-blogTagItem"><a class="takanorip-blogTagLink" href="/tags/${escapeHtml(tag)}/">${escapeHtml(tag)}</a></li>`,
    )
    .join("");
  return `<h2 class="takanorip-blogTitle takanorip-blogHead">${escapeHtml(title || "（無題）")}</h2>
<div class="takanorip-blogInfo">
  <div class="takanorip-blogDate">
    <p class="takanorip-blogDateDate">${escapeHtml(formatDate(date))}</p>
  </div>
  <ul class="takanorip-blogTagList">${tags}</ul>
</div>
<div class="takanorip-blogBoby">
  ${embedTweets(renderMarkdown(body))}
</div>`;
};
