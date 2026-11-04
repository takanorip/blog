import { parseFrontMatter, postPath, POST_DIR } from "../shared/frontmatter";

const API = "https://api.github.com";
const USER_AGENT = "takanorip-blog-editor";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class ConflictError extends Error {}

export type Repo = {
  owner: string;
  name: string;
  branch: string;
};

export type PostSummary = {
  slug: string;
  title: string;
  date: string;
  draft: boolean;
  sha: string;
};

export type Post = {
  slug: string;
  content: string;
  sha: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const request = async <T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> => {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new GitHubError(res.status, `GitHub API ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
};

const decodeBase64 = (value: string) => {
  const binary = atob(value.replace(/\s/g, ""));
  return decoder.decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

export const gitBlobSha = async (content: string) => {
  const body = encoder.encode(content);
  const header = encoder.encode(`blob ${body.length}\0`);
  const data = new Uint8Array(header.length + body.length);
  data.set(header);
  data.set(body, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const getUser = (token: string) =>
  request<{ login: string; avatar_url: string }>(token, "/user");

export const exchangeCode = async (
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
) => {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!json.access_token) {
    throw new GitHubError(401, json.error_description ?? "OAuth failed");
  }
  return json.access_token;
};

const repoPath = (repo: Repo) =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;

const getFile = async (
  token: string,
  repo: Repo,
  path: string,
  ref: string,
): Promise<{ content: string; sha: string } | null> => {
  try {
    const file = await request<{ content: string; sha: string; type: string }>(
      token,
      `${repoPath(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (file.type !== "file") return null;
    return { content: decodeBase64(file.content), sha: file.sha };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
};

const getHead = async (token: string, repo: Repo) => {
  const ref = await request<{ object: { sha: string } }>(
    token,
    `${repoPath(repo)}/git/ref/heads/${encodePath(repo.branch)}`,
  );
  return ref.object.sha;
};

export const listPosts = async (
  token: string,
  repo: Repo,
): Promise<PostSummary[]> => {
  type Entry = {
    name: string;
    type: string;
    oid: string;
    object: { text: string | null } | null;
  };
  const res = await request<{
    data?: { repository: { object: { entries: Entry[] } | null } | null };
    errors?: { message: string }[];
  }>(token, "/graphql", {
    method: "POST",
    body: {
      query: `query($owner: String!, $name: String!, $expr: String!) {
        repository(owner: $owner, name: $name) {
          object(expression: $expr) {
            ... on Tree { entries { name type oid object { ... on Blob { text } } } }
          }
        }
      }`,
      variables: {
        owner: repo.owner,
        name: repo.name,
        expr: `${repo.branch}:${POST_DIR}`,
      },
    },
  });
  if (res.errors?.length) {
    throw new GitHubError(502, res.errors.map((e) => e.message).join(", "));
  }
  const entries = res.data?.repository?.object?.entries ?? [];
  return entries
    .filter((e) => e.type === "blob" && e.name.endsWith(".md"))
    .map((e) => {
      const fm = parseFrontMatter(e.object?.text ?? "");
      return {
        slug: e.name.replace(/\.md$/, ""),
        title: fm.title,
        date: fm.date,
        draft: fm.draft,
        sha: e.oid,
      };
    })
    .sort(
      (a, b) =>
        (b.date || b.slug).localeCompare(a.date || a.slug) ||
        b.slug.localeCompare(a.slug),
    );
};

export const getPost = async (
  token: string,
  repo: Repo,
  slug: string,
): Promise<Post | null> => {
  const file = await getFile(token, repo, postPath(slug), repo.branch);
  return file ? { slug, ...file } : null;
};

const commitMessage = (
  slug: string,
  previousSlug: string,
  wasDraft: boolean | null,
  isDraft: boolean,
) => {
  let action: string;
  if (wasDraft === null) action = isDraft ? "Add draft" : "Publish";
  else if (wasDraft && !isDraft) action = "Publish";
  else if (!wasDraft && isDraft) action = "Unpublish";
  else action = isDraft ? "Update draft" : "Update";
  const rename = slug !== previousSlug ? ` (renamed from ${previousSlug})` : "";
  // Draft-only commits never change the built site, so skip the Pages build.
  const skip = isDraft && wasDraft !== false ? " [skip ci]" : "";
  return `${action}: ${slug}${rename}${skip}`;
};

export const savePost = async (
  token: string,
  repo: Repo,
  params: {
    slug: string;
    newSlug: string;
    content: string;
    sha: string | null;
  },
) => {
  const { slug, newSlug, content, sha } = params;
  const oldPath = postPath(slug);
  const newPath = postPath(newSlug);
  const renamed = oldPath !== newPath;

  const headSha = await getHead(token, repo);
  const current = await getFile(token, repo, oldPath, headSha);

  if (sha === null) {
    if (current) throw new ConflictError("同じファイル名の記事がすでにあります");
  } else if (!current || current.sha !== sha) {
    throw new ConflictError(
      "GitHub 上のファイルが更新されています。再読み込みしてください",
    );
  }
  if (renamed && sha !== null && (await getFile(token, repo, newPath, headSha))) {
    throw new ConflictError("変更先のファイル名はすでに使われています");
  }

  const blobSha = await gitBlobSha(content);
  if (current && !renamed && current.sha === blobSha) {
    return { slug: newSlug, sha: blobSha, commit: headSha, changed: false };
  }

  const headCommit = await request<{ tree: { sha: string } }>(
    token,
    `${repoPath(repo)}/git/commits/${headSha}`,
  );
  const entries: Record<string, unknown>[] = [
    { path: newPath, mode: "100644", type: "blob", content },
  ];
  if (renamed && current) {
    entries.push({ path: oldPath, mode: "100644", type: "blob", sha: null });
  }
  const tree = await request<{ sha: string }>(
    token,
    `${repoPath(repo)}/git/trees`,
    { method: "POST", body: { base_tree: headCommit.tree.sha, tree: entries } },
  );

  const wasDraft = current ? parseFrontMatter(current.content).draft : null;
  const isDraft = parseFrontMatter(content).draft;
  const commit = await request<{ sha: string }>(
    token,
    `${repoPath(repo)}/git/commits`,
    {
      method: "POST",
      body: {
        message: commitMessage(newSlug, slug, wasDraft, isDraft),
        tree: tree.sha,
        parents: [headSha],
      },
    },
  );

  try {
    await request(token, `${repoPath(repo)}/git/refs/heads/${encodePath(repo.branch)}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
  } catch (e) {
    if (e instanceof GitHubError && e.status === 422) {
      throw new ConflictError(
        "保存中にブランチが更新されました。もう一度保存してください",
      );
    }
    throw e;
  }

  return { slug: newSlug, sha: blobSha, commit: commit.sha, changed: true };
};
