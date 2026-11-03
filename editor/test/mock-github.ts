import { gitBlobSha } from "../server/github";

type Commit = { sha: string; tree: string; message: string; parents: string[] };

export type MockGitHub = {
  files: () => Map<string, string>;
  commits: Commit[];
  login: string;
  /** Simulate someone else pushing to the branch. */
  push: (path: string, content: string | null, message?: string) => Promise<void>;
  restore: () => void;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let counter = 0;
const id = (prefix: string) =>
  `${prefix}${(++counter).toString(16).padStart(39 - prefix.length, "0")}`;

export const installMockGitHub = (opts: {
  owner: string;
  name: string;
  branch: string;
  login: string;
  files: Record<string, string>;
}): MockGitHub => {
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, Commit>();
  const log: Commit[] = [];
  let head = "";

  const makeCommit = (files: Map<string, string>, message: string, parents: string[]) => {
    const tree = id("t");
    trees.set(tree, files);
    const commit = { sha: id("c"), tree, message, parents };
    commits.set(commit.sha, commit);
    log.push(commit);
    return commit;
  };
  head = makeCommit(new Map(Object.entries(opts.files)), "init", []).sha;

  const filesAt = (ref: string) => {
    const sha = ref === opts.branch ? head : ref;
    const commit = commits.get(sha);
    return commit ? trees.get(commit.tree)! : null;
  };

  const repo = `/repos/${opts.owner}/${opts.name}`;
  const original = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === "github.com" && url.pathname === "/login/oauth/access_token") {
      return json({ access_token: "mock-token" });
    }
    if (url.hostname !== "api.github.com") return original(input, init);
    if (req.headers.get("Authorization") !== "Bearer mock-token") {
      return json({ message: "Bad credentials" }, 401);
    }
    const path = decodeURIComponent(url.pathname);
    const body = req.method === "GET" ? null : await req.json();

    if (path === "/user") return json({ login: mock.login, avatar_url: "" });

    if (path === "/graphql") {
      const [ref, dir] = (body.variables.expr as string).split(":");
      const files = filesAt(ref)!;
      const entries = await Promise.all(
        [...files]
          .filter(([p]) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/"))
          .map(async ([p, text]) => ({
            name: p.slice(dir.length + 1),
            type: "blob",
            oid: await gitBlobSha(text),
            object: { text },
          })),
      );
      return json({ data: { repository: { object: { entries } } } });
    }

    if (path.startsWith(`${repo}/contents/`) && req.method === "GET") {
      const filePath = path.slice(`${repo}/contents/`.length);
      const files = filesAt(url.searchParams.get("ref") ?? opts.branch);
      const content = files?.get(filePath);
      if (content === undefined) return json({ message: "Not Found" }, 404);
      const bytes = new TextEncoder().encode(content);
      return json({
        type: "file",
        sha: await gitBlobSha(content),
        content: Buffer.from(bytes).toString("base64").replace(/(.{60})/g, "$1\n"),
      });
    }

    if (path === `${repo}/git/ref/heads/${opts.branch}`) {
      return json({ object: { sha: head } });
    }

    if (path.startsWith(`${repo}/git/commits/`) && req.method === "GET") {
      const commit = commits.get(path.split("/").pop()!);
      return commit ? json({ sha: commit.sha, tree: { sha: commit.tree } }) : json({}, 404);
    }

    if (path === `${repo}/git/trees` && req.method === "POST") {
      const base = trees.get(body.base_tree);
      if (!base) return json({ message: "base tree not found" }, 422);
      const next = new Map(base);
      for (const entry of body.tree) {
        if (entry.sha === null) next.delete(entry.path);
        else next.set(entry.path, entry.content);
      }
      const sha = id("t");
      trees.set(sha, next);
      return json({ sha }, 201);
    }

    if (path === `${repo}/git/commits` && req.method === "POST") {
      const commit = { sha: id("c"), tree: body.tree, message: body.message, parents: body.parents };
      commits.set(commit.sha, commit);
      return json({ sha: commit.sha }, 201);
    }

    if (path === `${repo}/git/refs/heads/${opts.branch}` && req.method === "PATCH") {
      const commit = commits.get(body.sha);
      if (!commit || (!body.force && commit.parents[0] !== head)) {
        return json({ message: "Update is not a fast forward" }, 422);
      }
      head = commit.sha;
      log.push(commit);
      return json({ object: { sha: head } });
    }

    return json({ message: `Unhandled ${req.method} ${path}` }, 500);
  };

  const mock: MockGitHub = {
    files: () => filesAt(head)!,
    commits: log,
    login: opts.login,
    push: async (path, content, message = "external push") => {
      const next = new Map(filesAt(head)!);
      if (content === null) next.delete(path);
      else next.set(path, content);
      head = makeCommit(next, message, [head]).sha;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
  return mock;
};
