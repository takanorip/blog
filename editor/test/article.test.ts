import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { previewDocument, renderArticle } from "../client/article";

const post = `---
title: "Tom & Jerry"
date: 2026-09-23
tags:
  - random
  - blog
layout: layouts/blog.njk
---

本文

\`\`\`js
const a = 1;
\`\`\`

https://x.com/takanoripe/status/1728772752612684177?s=20
`;

describe("renderArticle", () => {
  const html = renderArticle(post);

  test("uses the blog layout markup", () => {
    assert.match(html, /<h2 class="takanorip-blogTitle takanorip-blogHead">Tom &#38; Jerry<\/h2>/);
    assert.match(html, /<p class="takanorip-blogDateDate">2026年9月23日<\/p>/);
    assert.match(
      html,
      /<ul class="takanorip-blogTagList"><li class="takanorip-blogTagItem"><a class="takanorip-blogTagLink" href="\/tags\/random\/">random<\/a><\/li><\/ul>/,
    );
    assert.match(html, /<div class="takanorip-blogBoby">\s*<p>本文<\/p>/);
  });

  test("highlights code like eleventy-plugin-syntaxhighlight", () => {
    assert.match(
      html,
      /<pre class="language-js"><code class="language-js"><span class="token keyword">const<\/span> a/,
    );
  });

  test("turns tweet links into the embed markup", () => {
    assert.match(
      html,
      /<div class="eleventy-plugin-embed-twitter"><blockquote class="twitter-tweet"><a href="https:\/\/twitter.com\/takanoripe\/status\/1728772752612684177">/,
    );
  });
});

test("previewDocument loads the site stylesheets", () => {
  const doc = previewDocument("https://blog.example.com");
  assert.match(doc, /<base href="https:\/\/blog.example.com\/"/);
  assert.match(doc, /href="\/css\/index.css"/);
  assert.match(doc, /href="\/css\/prism.css"/);
  assert.match(doc, /<body class="blog-content takanorip-blogBase"><main class="takanorip-contents">/);
});
