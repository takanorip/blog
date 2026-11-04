export type Me = { login: string; repo: string; branch: string };
export type Summary = {
  slug: string;
  title: string;
  date: string;
  draft: boolean;
  sha: string;
};
export type Post = { slug: string; content: string; sha: string };
export type SaveResult = {
  slug: string;
  sha: string;
  commit: string;
  changed: boolean;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`/admin/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`);
  return json as T;
};

const RETURN_KEY = "blog-editor:return-to";

export const login = () => {
  sessionStorage.setItem(RETURN_KEY, location.hash);
  location.href = "/admin/api/auth/login";
};

export const takeReturnHash = () => {
  const hash = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return hash;
};

let postsCache: Summary[] | null = null;

export const loadPosts = async (force = false) => {
  if (!postsCache || force) {
    postsCache = (await api<{ posts: Summary[] }>("/posts")).posts;
  }
  return postsCache;
};

export const invalidatePosts = () => {
  postsCache = null;
};

export type Backup = {
  content: string;
  slug: string;
  sha: string | null;
  at: number;
};

const BACKUP_PREFIX = "blog-editor:backup:";

export const readBackup = (key: string): Backup | null => {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_PREFIX + key) ?? "null");
  } catch {
    return null;
  }
};

export const writeBackup = (key: string, backup: Backup) =>
  localStorage.setItem(BACKUP_PREFIX + key, JSON.stringify(backup));

export const clearBackup = (key: string) =>
  localStorage.removeItem(BACKUP_PREFIX + key);
