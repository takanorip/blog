import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { app, type Env } from "../server/app";
import { parseFrontMatter, setDraft } from "../shared/frontmatter";
import { installMockGitHub, type MockGitHub } from "./mock-github";

const ORIGIN = "https://blog.example.com";
const env: Env = {
  GITHUB_CLIENT_ID: "client",
  GITHUB_CLIENT_SECRET: "secret",
  SESSION_SECRET: "test-session-secret",
  ALLOWED_GITHUB_LOGIN: "takanorip",
  GITHUB_REPO: "takanorip/blog",
  GITHUB_BRANCH: "master",
};

const published = `---
title: 公開済み
date: 2026-09-23
tags:
  - random
layout: layouts/blog.njk
---

本文
`;
const draft = `---
title: "書きかけ"
date: 2026-10-01
layout: layouts/blog.njk
draft: true
---

下書き
`;

let gh: MockGitHub;

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("Cookie", init.cookie);
  return app.fetch(new Request(`${ORIGIN}/admin/api${path}`, { ...init, headers }), env);
};

const cookieValue = (res: Response, name: string) => {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return header ? header.split(";")[0] : undefined;
};

const loginAs = async (login: string) => {
  gh.login = login;
  const start = await call("/auth/login");
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
  const stateCookie = cookieValue(start, "blog_editor_oauth_state")!;
  const res = await call(`/auth/callback?code=abc&state=${state}`, { cookie: stateCookie });
  return { res, session: cookieValue(res, "blog_editor_session") };
};

const put = (cookie: string, slug: string, body: unknown) =>
  call(`/posts/${slug}`, {
    method: "PUT",
    cookie,
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });

const lastMessage = () => gh.commits[gh.commits.length - 1].message;

beforeEach(() => {
  gh = installMockGitHub({
    owner: "takanorip",
    name: "blog",
    branch: "master",
    login: "takanorip",
    files: {
      "src/posts/2026-09-23.md": published,
      "src/posts/2026-10-01.md": draft,
      "src/posts/posts.json": "{}",
      "src/index.njk": "",
    },
  });
});

afterEach(() => gh.restore());

describe("auth", () => {
  test("rejects API calls without a session", async () => {
    assert.equal((await call("/me")).status, 401);
    assert.equal((await call("/posts")).status, 401);
  });

  test("rejects GitHub users other than the allowed one", async () => {
    const { res, session } = await loginAs("someone-else");
    assert.equal(res.status, 403);
    assert.equal(session, undefined);
  });

  test("rejects a callback whose state does not match", async () => {
    const res = await call("/auth/callback?code=abc&state=forged", {
      cookie: "blog_editor_oauth_state=real",
    });
    assert.equal(res.status, 401);
  });

  test("rejects a tampered session cookie", async () => {
    const { session } = await loginAs("takanorip");
    const tampered = session!.slice(0, -4) + "AAAA";
    assert.equal((await call("/me", { cookie: tampered })).status, 401);
  });

  test("logs in the allowed user", async () => {
    const { res, session } = await loginAs("TakanoRip");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/admin/");
    const me = await call("/me", { cookie: session });
    assert.deepEqual(await me.json(), {
      login: "TakanoRip",
      repo: "takanorip/blog",
      branch: "master",
    });
  });

  test("rejects cross-origin writes", async () => {
    const { session } = await loginAs("takanorip");
    const res = await call("/posts/2026-09-23", {
      method: "PUT",
      cookie: session,
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ content: "x", sha: null }),
    });
    assert.equal(res.status, 403);
  });
});

describe("posts", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = (await loginAs("takanorip")).session!;
  });

  test("lists markdown posts with front matter", async () => {
    const { posts } = await (await call("/posts", { cookie })).json();
    assert.deepEqual(
      posts.map((p: any) => [p.slug, p.title, p.draft]),
      [
        ["2026-10-01", "書きかけ", true],
        ["2026-09-23", "公開済み", false],
      ],
    );
  });

  test("reads a post", async () => {
    const post = await (await call("/posts/2026-09-23", { cookie })).json();
    assert.equal(post.content, published);
    assert.equal((await call("/posts/missing", { cookie })).status, 404);
  });

  test("rejects slugs that could escape the posts directory", async () => {
    for (const slug of ["..%2Fsecrets", ".hidden", "a%20b", "x.md"]) {
      const res = await put(cookie, slug, { content: "x", sha: null });
      assert.equal(res.status, 400, slug);
    }
    const res = await put(cookie, "2026-09-23", {
      content: "x",
      sha: "whatever",
      newSlug: "../../package",
    });
    assert.equal(res.status, 400);
  });

  test("creates a draft without triggering a deploy", async () => {
    const content = setDraft("---\ntitle: 新しい記事\n---\n\nhello\n", true);
    const res = await put(cookie, "new-post", { content, sha: null });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.slug, "new-post");
    assert.equal(gh.files().get("src/posts/new-post.md"), content);
    assert.equal(lastMessage(), "Add draft: new-post [skip ci]");

    const again = await put(cookie, "new-post", { content, sha: null });
    assert.equal(again.status, 409);
  });

  test("saves drafts, publishes, updates and unpublishes", async () => {
    const read = async () => (await call("/posts/2026-10-01", { cookie })).json();
    let post = await read();

    let res = await put(cookie, "2026-10-01", { content: post.content + "追記\n", sha: post.sha });
    assert.equal(res.status, 200);
    assert.equal(lastMessage(), "Update draft: 2026-10-01 [skip ci]");

    post = await read();
    res = await put(cookie, "2026-10-01", { content: setDraft(post.content, false), sha: post.sha });
    assert.equal(lastMessage(), "Publish: 2026-10-01");
    assert.equal(parseFrontMatter(gh.files().get("src/posts/2026-10-01.md")!).draft, false);

    post = await read();
    res = await put(cookie, "2026-10-01", { content: post.content + "more\n", sha: post.sha });
    assert.equal(lastMessage(), "Update: 2026-10-01");

    post = await read();
    res = await put(cookie, "2026-10-01", { content: setDraft(post.content, true), sha: post.sha });
    assert.equal(lastMessage(), "Unpublish: 2026-10-01");
  });

  test("does not commit when nothing changed", async () => {
    const post = await (await call("/posts/2026-09-23", { cookie })).json();
    const count = gh.commits.length;
    const res = await put(cookie, "2026-09-23", { content: post.content, sha: post.sha });
    assert.equal((await res.json()).changed, false);
    assert.equal(gh.commits.length, count);
  });

  test("renames a post in a single commit", async () => {
    const post = await (await call("/posts/2026-10-01", { cookie })).json();
    const res = await put(cookie, "2026-10-01", {
      content: post.content,
      sha: post.sha,
      newSlug: "fountain-pen",
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).slug, "fountain-pen");
    assert.equal(gh.files().has("src/posts/2026-10-01.md"), false);
    assert.equal(gh.files().get("src/posts/fountain-pen.md"), post.content);
    assert.equal(lastMessage(), "Update draft: fountain-pen (renamed from 2026-10-01) [skip ci]");
  });

  test("refuses to rename onto an existing post", async () => {
    const post = await (await call("/posts/2026-10-01", { cookie })).json();
    const res = await put(cookie, "2026-10-01", {
      content: post.content,
      sha: post.sha,
      newSlug: "2026-09-23",
    });
    assert.equal(res.status, 409);
    assert.equal(gh.files().get("src/posts/2026-09-23.md"), published);
  });

  test("detects edits pushed from elsewhere", async () => {
    const post = await (await call("/posts/2026-09-23", { cookie })).json();
    await gh.push("src/posts/2026-09-23.md", published + "Cursor で編集\n");
    const res = await put(cookie, "2026-09-23", { content: post.content + "x", sha: post.sha });
    assert.equal(res.status, 409);
    assert.match(gh.files().get("src/posts/2026-09-23.md")!, /Cursor で編集/);
  });

  test("keeps unrelated pushes when saving", async () => {
    const post = await (await call("/posts/2026-09-23", { cookie })).json();
    await gh.push("src/index.njk", "changed elsewhere");
    const res = await put(cookie, "2026-09-23", { content: post.content + "x", sha: post.sha });
    assert.equal(res.status, 200);
    assert.equal(gh.files().get("src/index.njk"), "changed elsewhere");
  });
});

describe("front matter", () => {
  test("toggles the draft flag without touching the body", () => {
    const on = setDraft(published, true);
    assert.equal(parseFrontMatter(on).draft, true);
    assert.equal(on.split("---\n").pop(), published.split("---\n").pop());
    assert.equal(setDraft(on, false), published);
    assert.equal(setDraft(setDraft(on, true), true), on);
  });

  test("handles files without front matter", () => {
    assert.equal(setDraft("body", true), "---\ndraft: true\n---\nbody");
    assert.equal(setDraft("body", false), "body");
  });
});
