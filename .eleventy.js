module.exports = function (eleventyConfig) {
  const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
  const pluginRss = require("@11ty/eleventy-plugin-rss");
  const markdownIt = require("markdown-it");
  const markdownItAnchor = require("markdown-it-anchor");
  const markdownItTableOfContents = require("@takanorip/markdown-it-table-of-contents");
  const iterator = require("markdown-it-for-inline");
  const format = require("date-fns/format");
  const removeMd = require("remove-markdown");
  const embedTwitter = require("eleventy-plugin-embed-twitter");
  const { loadDefaultJapaneseParser } = require("budoux");
  const UpgradeHelper = require("@11ty/eleventy-upgrade-help");
  const _groupBy = require("lodash.groupby");
  const _uniq = require("lodash.uniq");

  const parser = loadDefaultJapaneseParser();

  const markdownLib = markdownIt({
    html: true,
    breaks: true,
    linkify: true,
  })
    .use(markdownItAnchor)
    .use(markdownItTableOfContents, {
      includeLevel: [1, 2, 3],
      containerTag: "details",
      containerHeaderHtml:
        '<summary class="toc-container-header">TOC</summary>',
    })
    .use(iterator, "url_new_win", "link_open", (tokens, idx) => {
      tokens[idx].attrPush(["target", "_blank"]);
      tokens[idx].attrPush(["rel", "noopener noreferrer"]);
    })
    .use(iterator, "lazy_loading", "image", (tokens, idx) => {
      tokens[idx].attrSet("loading", "lazy");
    });

  const bodyText = (md) => {
    const text = removeMd(md);
    return text.replace(/\[\[toc\]\]/g, "").replace(/\r?\n/g, "");
  };

  eleventyConfig.addLayoutAlias("blog", "layouts/blog.njk");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(embedTwitter, {
    cacheText: true,
  });
  eleventyConfig.setDataDeepMerge(true);
  eleventyConfig.addNunjucksFilter("dateFormat", (value) => {
    return value instanceof Date ? format(value, "yyyy-MM-dd") : "";
  });
  eleventyConfig.setLibrary("md", markdownLib);
  eleventyConfig.addCollection("algolia", (collection) => {
    return collection.getFilteredByTags("blog").map((item) => {
      const body = bodyText(item.template.frontMatter.content);
      return {
        action: "partialUpdateObject",
        body: {
          id: item.fileSlug,
          objectID: item.fileSlug,
          url: item.url,
          body: body,
          excerpt: body.substring(0, 79) + "...",
          title: item.data.title,
          createdAt: format(item.date, "yyyy-MM-dd"),
        },
      };
    });
  });
  eleventyConfig.addShortcode("budoux", (t) => {
    return parser.translateHTMLString(t);
  });
  eleventyConfig.addPlugin(UpgradeHelper);
  eleventyConfig.addCollection("postsGroupedByYear", (collection) => {
    const posts = collection.getFilteredByTags("blog");
    return _groupBy(posts, (item) => new Date(item.data.date).getFullYear());
  });
  eleventyConfig.addCollection("postsYears", (collection) => {
    const posts = collection.getFilteredByTags("blog");
    const years = _uniq(
      posts.map((item) => new Date(item.data.date).getFullYear()),
    );
    const sortedYears = years.sort((a, b) => b - a);
    return sortedYears;
  });

  return {
    templateFormats: ["md", "njk", "html", "liquid"],

    // If your site lives in a different subdirectory, change this.
    // Leading or trailing slashes are all normalized away, so don’t worry about those.

    // If you don’t have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for link URLs (it does not affect your file structure)
    // You can also pass this in on the command line using `--pathprefix`

    // pathPrefix: "/",

    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "njk",

    // These are all optional, defaults are shown:
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
