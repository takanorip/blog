module.exports = {
  eleventyComputed: {
    ogImageUrl: data => `https://blog.takanorip.com/teasers/${data.page.fileSlug}.png`
  }
};