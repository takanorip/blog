import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginRss from "@11ty/eleventy-plugin-rss";
import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItTableOfContents from "@takanorip/markdown-it-table-of-contents";
import iterator from "markdown-it-for-inline";
import { format } from "date-fns";
import removeMd from "remove-markdown";
import embedTwitter from "eleventy-plugin-embed-twitter";
import { loadDefaultJapaneseParser } from "budoux";
import UpgradeHelper from "@11ty/eleventy-upgrade-help";
import _groupBy from "lodash.groupby";
import _uniq from "lodash.uniq";

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
    containerHeaderHtml: '<summary class="toc-container-header">TOC</summary>',
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

export default function (eleventyConfig) {
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
  eleventyConfig.addCollection("algolia", async (collection) => {
    const blog = collection.getFilteredByTags("blog");
    const result = await Promise.all(blog.map(async (item) => {
      const frontMatter = await item.template.read();
      const body = bodyText(frontMatter.content);
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
    }))
    return result;
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
    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "njk",
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
}