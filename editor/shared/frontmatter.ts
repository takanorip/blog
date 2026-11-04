const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const DRAFT_LINE = /^draft:.*(?:\r?\n|$)/m;

export type FrontMatter = {
  title: string;
  date: string;
  draft: boolean;
};

export const POST_DIR = "src/posts";
export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const isValidSlug = (slug: string) =>
  SLUG_PATTERN.test(slug) && slug.length <= 200 && !slug.endsWith(".md");

export const postPath = (slug: string) => `${POST_DIR}/${slug}.md`;

const unquote = (value: string) => {
  const v = value.trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1);
  }
  return v;
};

const readKey = (block: string, key: string) => {
  const match = block.match(new RegExp(`^${key}:(.*)$`, "m"));
  return match ? unquote(match[1]) : "";
};

export const splitFrontMatter = (content: string) => {
  const match = content.match(FRONT_MATTER);
  if (!match) return { block: null, body: content };
  return { block: match[1], body: content.slice(match[0].length) };
};

export const parseFrontMatter = (content: string): FrontMatter => {
  const { block } = splitFrontMatter(content);
  if (block === null) return { title: "", date: "", draft: false };
  return {
    title: readKey(block, "title"),
    date: readKey(block, "date"),
    draft: /^(true|yes|on)$/i.test(readKey(block, "draft")),
  };
};

export const setDraft = (content: string, draft: boolean): string => {
  const match = content.match(FRONT_MATTER);
  if (!match) {
    return draft ? `---\ndraft: true\n---\n${content}` : content;
  }
  let block = match[1].replace(DRAFT_LINE, "").replace(/\r?\n$/, "");
  if (draft) block = block ? `${block}\ndraft: true` : "draft: true";
  return `---\n${block}\n---\n${content.slice(match[0].length)}`;
};

export const frontMatterTemplate = (date: string, draft: boolean) => {
  const draftLine = draft ? "\ndraft: true" : "";
  return `---
title: 
date: ${date}
tags:
  - random
layout: layouts/blog.njk${draftLine}
---
`;
};

export const newPostTemplate = (date: string) => `${frontMatterTemplate(date, true)}\n`;

// The caret lands right after "title: " so the title can be typed immediately.
export const frontMatterCursor = (content: string) => {
  const at = content.search(/^title:[ \t]*/m);
  if (at < 0) return 0;
  const match = /^title:[ \t]*/.exec(content.slice(at));
  return at + (match?.[0].length ?? 0);
};

// Prepends the blog front matter. Returns null when the file already has one,
// because a second block would not be read as front matter.
export const insertFrontMatter = (content: string, date: string, draft: boolean) => {
  if (splitFrontMatter(content).block !== null) return null;
  const block = `${frontMatterTemplate(date, draft)}\n`;
  return {
    content: block + content.replace(/^\r?\n+/, ""),
    cursor: frontMatterCursor(block),
  };
};
