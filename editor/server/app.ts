import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isValidSlug } from "../shared/frontmatter";
import {
  ConflictError,
  exchangeCode,
  getPost,
  getUser,
  GitHubError,
  listPosts,
  savePost,
  type Repo,
} from "./github";
import { randomToken, sealSession, unsealSession, type Session } from "./session";

export type Env = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ALLOWED_GITHUB_LOGIN: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_OAUTH_SCOPE?: string;
};

type AppEnv = { Bindings: Env; Variables: { session: Session } };
type Ctx = Context<AppEnv>;

const SESSION_COOKIE = "blog_editor_session";
const STATE_COOKIE = "blog_editor_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const BASE = "/admin/api";

const REQUIRED_ENV = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "SESSION_SECRET",
  "ALLOWED_GITHUB_LOGIN",
] as const;

const isSecure = (c: Ctx) => new URL(c.req.url).protocol === "https:";

const repoOf = (env: Env): Repo => {
  const [owner, name] = (env.GITHUB_REPO || "takanorip/blog").split("/");
  return { owner, name, branch: env.GITHUB_BRANCH || "master" };
};

const isAllowed = (env: Env, login: string) =>
  login.toLowerCase() === env.ALLOWED_GITHUB_LOGIN.trim().toLowerCase();

const htmlMessage = (c: Ctx, status: 401 | 403 | 500, message: string) =>
  c.html(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blog Editor</title>
<body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.6">
<p>${message.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`)}</p>
<p><a href="/admin/">エディタに戻る</a></p></body>`,
    status,
  );

export const app = new Hono<AppEnv>().basePath(BASE);

app.use("*", async (c, next) => {
  const missing = REQUIRED_ENV.filter((key) => !c.env?.[key]);
  if (missing.length) {
    return c.json({ error: `環境変数が未設定です: ${missing.join(", ")}` }, 500);
  }
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "Invalid origin" }, 403);
    }
  }
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
});

app.get("/auth/login", (c) => {
  const state = randomToken();
  const origin = new URL(c.req.url).origin;
  setCookie(c, STATE_COOKIE, state, {
    path: `${BASE}/auth`,
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: `${origin}${BASE}/auth/callback`,
    scope: c.env.GITHUB_OAUTH_SCOPE ?? "public_repo",
    state,
    allow_signup: "false",
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get("/auth/callback", async (c) => {
  const state = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: `${BASE}/auth` });
  const code = c.req.query("code");
  if (!code || !state || c.req.query("state") !== state) {
    return htmlMessage(c, 401, "ログインに失敗しました。もう一度お試しください。");
  }
  const origin = new URL(c.req.url).origin;
  let token: string;
  let user: { login: string };
  try {
    token = await exchangeCode(
      c.env.GITHUB_CLIENT_ID,
      c.env.GITHUB_CLIENT_SECRET,
      code,
      `${origin}${BASE}/auth/callback`,
    );
    user = await getUser(token);
  } catch (e) {
    console.error(e);
    return htmlMessage(c, 401, "GitHub での認証に失敗しました。もう一度お試しください。");
  }
  if (!isAllowed(c.env, user.login)) {
    return htmlMessage(c, 403, `${user.login} にはこのエディタへのアクセス権がありません。`);
  }
  const sealed = await sealSession(
    { login: user.login, token, exp: Date.now() + SESSION_TTL_SECONDS * 1000 },
    c.env.SESSION_SECRET,
  );
  setCookie(c, SESSION_COOKIE, sealed, {
    path: "/admin",
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
  });
  return c.redirect("/admin/");
});

app.post("/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/admin" });
  return c.json({ ok: true });
});

app.use("*", async (c, next) => {
  const raw = getCookie(c, SESSION_COOKIE);
  const session = raw ? await unsealSession(raw, c.env.SESSION_SECRET) : null;
  if (!session || !isAllowed(c.env, session.login)) {
    return c.json({ error: "ログインが必要です" }, 401);
  }
  c.set("session", session);
  await next();
});

app.get("/me", (c) => {
  const repo = repoOf(c.env);
  return c.json({
    login: c.var.session.login,
    repo: `${repo.owner}/${repo.name}`,
    branch: repo.branch,
  });
});

app.get("/posts", async (c) => {
  const posts = await listPosts(c.var.session.token, repoOf(c.env));
  return c.json({ posts });
});

app.get("/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.json({ error: "不正なファイル名です" }, 400);
  const post = await getPost(c.var.session.token, repoOf(c.env), slug);
  if (!post) return c.json({ error: "記事が見つかりません" }, 404);
  return c.json(post);
});

app.put("/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{
    content?: unknown;
    sha?: unknown;
    newSlug?: unknown;
  }>();
  const newSlug = typeof body.newSlug === "string" ? body.newSlug : slug;
  if (!isValidSlug(slug) || !isValidSlug(newSlug)) {
    return c.json(
      { error: "ファイル名は英数字・ハイフン・アンダースコア・ドットのみ使えます" },
      400,
    );
  }
  if (typeof body.content !== "string") {
    return c.json({ error: "content がありません" }, 400);
  }
  const sha = typeof body.sha === "string" ? body.sha : null;
  if (sha === null && newSlug !== slug) {
    return c.json({ error: "新規作成時はファイル名を変更できません" }, 400);
  }
  const result = await savePost(c.var.session.token, repoOf(c.env), {
    slug,
    newSlug,
    content: body.content,
    sha,
  });
  return c.json(result);
});

app.onError((err, c) => {
  if (err instanceof ConflictError) {
    return c.json({ error: err.message }, 409);
  }
  if (err instanceof GitHubError) {
    console.error(err.message);
    if (err.status === 401) {
      deleteCookie(c, SESSION_COOKIE, { path: "/admin" });
      return c.json({ error: "GitHub の認証が切れました。再ログインしてください" }, 401);
    }
    if (err.status === 403 || err.status === 404) {
      return c.json({ error: "GitHub リポジトリへのアクセス権がありません" }, 403);
    }
    return c.json({ error: "GitHub API でエラーが発生しました" }, 502);
  }
  console.error(err);
  return c.json({ error: "サーバーエラーが発生しました" }, 500);
});
