import {
  isValidSlug,
  newPostTemplate,
  parseFrontMatter,
  setDraft,
  splitFrontMatter,
} from "../shared/frontmatter";
import { escapeHtml, renderMarkdown } from "./markdown";

type Me = { login: string; repo: string; branch: string };
type Summary = { slug: string; title: string; date: string; draft: boolean; sha: string };
type Post = { slug: string; content: string; sha: string };
type SaveResult = { slug: string; sha: string; commit: string; changed: boolean };
type Backup = { content: string; slug: string; sha: string | null; at: number };
type SaveMode = "draft" | "publish" | "unpublish" | "update";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const RETURN_KEY = "blog-editor:return-to";
const BACKUP_PREFIX = "blog-editor:backup:";

const root = document.getElementById("app")!;
let me: Me | null = null;
let postsCache: Summary[] | null = null;
let dirtyCheck: (() => boolean) | null = null;
let ignoreNextHashChange = false;
let currentHash = location.hash;

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`/admin/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`);
  return json as T;
};

type Attrs = Record<string, string | boolean | ((e: any) => void) | undefined>;
const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === false) continue;
    el.append(child);
  }
  return el;
};

const toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
document.body.append(toastEl);
let toastTimer: number | undefined;
const toast = (
  message: string,
  opts: { error?: boolean; action?: { label: string; run: () => void } } = {},
) => {
  window.clearTimeout(toastTimer);
  toastEl.replaceChildren(h("span", {}, message));
  if (opts.action) {
    const { label, run } = opts.action;
    toastEl.append(h("button", { type: "button", onclick: run }, label));
  }
  toastEl.className = `toast is-visible${opts.error ? " is-error" : ""}`;
  toastTimer = window.setTimeout(
    () => (toastEl.className = "toast"),
    opts.action ? 10000 : 4000,
  );
};

const login = () => {
  sessionStorage.setItem(RETURN_KEY, location.hash);
  location.href = "/admin/api/auth/login";
};

const handleError = (e: unknown) => {
  if (e instanceof ApiError && e.status === 401) {
    toast("ログインが切れました。編集内容はこの端末に保存されています", {
      error: true,
      action: { label: "ログイン", run: login },
    });
    return;
  }
  toast(e instanceof Error ? e.message : String(e), { error: true });
};

const todayInTokyo = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
};

const parseTags = (block: string | null) => {
  if (!block) return [];
  const inline = block.match(/^tags:\s*\[(.*)\]\s*$/m);
  if (inline) return inline[1].split(",").map((t) => t.trim()).filter(Boolean);
  const list = block.match(/^tags:\s*\r?\n((?:\s+-.*(?:\r?\n|$))+)/m);
  if (!list) return [];
  return list[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
};

const loadPosts = async (force = false) => {
  if (!postsCache || force) postsCache = (await api<{ posts: Summary[] }>("/posts")).posts;
  return postsCache;
};

const readBackup = (key: string): Backup | null => {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_PREFIX + key) ?? "null");
  } catch {
    return null;
  }
};
const writeBackup = (key: string, backup: Backup) =>
  localStorage.setItem(BACKUP_PREFIX + key, JSON.stringify(backup));
const clearBackup = (key: string) => localStorage.removeItem(BACKUP_PREFIX + key);

const header = (...extra: Node[]) =>
  h(
    "header",
    { class: "app-header" },
    h("a", { class: "app-title", href: "#/" }, "Blog Editor"),
    ...extra,
  );

const renderLogin = (message?: string) => {
  root.replaceChildren(
    h(
      "main",
      { class: "login" },
      h("h1", {}, "Blog Editor"),
      h("p", {}, message ?? "GitHub アカウントでログインしてください。"),
      h("button", { type: "button", class: "btn btn-primary", onclick: login }, "GitHub でログイン"),
    ),
  );
};

const renderList = async () => {
  type Filter = "all" | "draft" | "published";
  let filter: Filter = "all";
  let query = "";
  const list = h("ul", { class: "post-list" }, h("li", { class: "empty" }, "読み込み中…"));
  const counts = h("span", { class: "counts" });

  const draw = (posts: Summary[]) => {
    const q = query.trim().toLowerCase();
    const shown = posts.filter(
      (p) =>
        (filter === "all" || (filter === "draft") === p.draft) &&
        (!q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
    );
    const drafts = posts.filter((p) => p.draft).length;
    counts.textContent = `${posts.length} 件（下書き ${drafts} 件）`;
    list.replaceChildren(
      ...(shown.length
        ? shown.map((p) =>
            h(
              "li",
              {},
              h(
                "a",
                { class: "post-item", href: `#/edit/${encodeURIComponent(p.slug)}` },
                h("span", { class: "post-title" }, p.title || "（無題）"),
                h(
                  "span",
                  { class: "post-meta" },
                  p.draft ? h("span", { class: "badge badge-draft" }, "下書き") : null,
                  h("span", {}, p.date ? p.date.slice(0, 10) : ""),
                  h("span", { class: "post-slug" }, `/posts/${p.slug}/`),
                ),
              ),
            ),
          )
        : [h("li", { class: "empty" }, "記事がありません")]),
    );
  };

  const filterButtons = (["all", "draft", "published"] as Filter[]).map((f) =>
    h(
      "button",
      {
        type: "button",
        class: `chip${f === filter ? " is-active" : ""}`,
        onclick: (e: Event) => {
          filter = f;
          filterButtons.forEach((b) => b.classList.toggle("is-active", b === e.currentTarget));
          if (postsCache) draw(postsCache);
        },
      },
      { all: "すべて", draft: "下書き", published: "公開中" }[f],
    ),
  );

  root.replaceChildren(
    header(
      h("span", { class: "spacer" }),
      h("span", { class: "user" }, me!.login),
      h(
        "button",
        {
          type: "button",
          class: "btn btn-ghost",
          onclick: async () => {
            await api("/auth/logout", { method: "POST" });
            renderLogin("ログアウトしました。");
          },
        },
        "ログアウト",
      ),
    ),
    h(
      "main",
      { class: "list-view" },
      h(
        "div",
        { class: "list-toolbar" },
        h("input", {
          type: "search",
          class: "input",
          placeholder: "タイトル・ファイル名で検索",
          oninput: (e: Event) => {
            query = (e.target as HTMLInputElement).value;
            if (postsCache) draw(postsCache);
          },
        }),
        h("a", { class: "btn btn-primary", href: "#/new" }, "＋ 新規作成"),
      ),
      h(
        "div",
        { class: "list-filters" },
        ...filterButtons,
        h("span", { class: "spacer" }),
        counts,
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-small",
            onclick: () => loadPosts(true).then(draw, handleError),
          },
          "更新",
        ),
      ),
      list,
    ),
  );

  try {
    draw(await loadPosts());
  } catch (e) {
    handleError(e);
    list.replaceChildren(h("li", { class: "empty" }, "読み込みに失敗しました"));
  }
};

const previewSkeleton = () => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<base href="${location.origin}/" target="_blank">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<link rel="stylesheet" href="/css/index.css">
<link rel="stylesheet" href="/css/prism.css">
</head><body class="blog-content takanorip-blogBase"><main class="takanorip-contents"></main></body></html>`;

const renderEditor = async (slug: string | null) => {
  const isNewRoute = slug === null;
  root.replaceChildren(header(h("span", { class: "spacer" }), h("span", {}, "読み込み中…")));

  let state: { slug: string; sha: string | null; saved: string };
  try {
    if (isNewRoute) {
      const posts = await loadPosts();
      const taken = new Set(posts.map((p) => p.slug));
      const base = todayInTokyo();
      let candidate = base;
      for (let i = 2; taken.has(candidate); i++) candidate = `${base}-${i}`;
      state = { slug: candidate, sha: null, saved: newPostTemplate(base) };
    } else {
      const post = await api<Post>(`/posts/${encodeURIComponent(slug)}`);
      state = { slug: post.slug, sha: post.sha, saved: post.content };
    }
  } catch (e) {
    handleError(e);
    root.replaceChildren(
      header(),
      h("main", { class: "list-view" }, h("p", { class: "empty" }, "記事を読み込めませんでした。"), h("a", { href: "#/" }, "一覧に戻る")),
    );
    return;
  }

  let busy = false;
  let backupKey = state.sha === null ? "new" : state.slug;
  const isNew = () => state.sha === null;
  const savedIsDraft = () => isNew() || parseFrontMatter(state.saved).draft;

  const textarea = h("textarea", {
    class: "editor-textarea",
    spellcheck: "false",
    autocapitalize: "off",
    "aria-label": "本文",
  });
  textarea.value = state.saved;

  const slugInput = h("input", {
    class: "slug-input",
    type: "text",
    inputmode: "url",
    autocapitalize: "off",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "ファイル名（URL）",
  });
  slugInput.value = state.slug;

  const status = h("span", { class: "badge" });
  const dirtyMark = h("span", { class: "dirty", title: "未保存の変更があります" }, "●");
  const viewLink = h(
    "a",
    { class: "btn btn-ghost view-link", target: "_blank", rel: "noopener", title: "サイトで見る" },
    h("span", { class: "view-link-label" }, "サイトで見る"),
    "↗",
  );
  const primaryBtn = h("button", { type: "button", class: "btn btn-primary" });
  const secondaryBtn = h("button", { type: "button", class: "btn" });
  const banner = h("div", { class: "banner", hidden: true });

  const iframe = h("iframe", {
    class: "preview-frame",
    title: "プレビュー",
    sandbox: "allow-same-origin allow-popups allow-popups-to-escape-sandbox",
  });
  iframe.srcdoc = previewSkeleton();

  const editPane = h("section", { class: "pane pane-edit" }, textarea);
  const previewPane = h("section", { class: "pane pane-preview" }, iframe);
  const panes = h("div", { class: "panes", "data-tab": "edit" }, editPane, previewPane);

  const tabs = (["edit", "preview"] as const).map((tab) =>
    h(
      "button",
      {
        type: "button",
        class: `tab${tab === "edit" ? " is-active" : ""}`,
        onclick: () => {
          panes.dataset.tab = tab;
          tabs.forEach((b, i) => b.classList.toggle("is-active", (i === 0) === (tab === "edit")));
          if (tab === "preview") renderPreview();
        },
      },
      tab === "edit" ? "編集" : "プレビュー",
    ),
  );

  const isDirty = () => textarea.value !== state.saved || slugInput.value.trim() !== state.slug;

  const refresh = () => {
    const draft = savedIsDraft();
    status.textContent = isNew() ? "新規" : draft ? "下書き" : "公開中";
    status.className = `badge ${draft ? "badge-draft" : "badge-published"}`;
    dirtyMark.hidden = !isDirty();
    slugInput.classList.toggle("is-invalid", !isValidSlug(slugInput.value.trim()));
    viewLink.hidden = draft;
    viewLink.setAttribute("href", `/posts/${encodeURIComponent(state.slug)}/`);
    primaryBtn.textContent = draft ? "公開する" : "更新する";
    secondaryBtn.textContent = draft ? "下書き保存" : "下書きに戻す";
    primaryBtn.disabled = secondaryBtn.disabled = busy;
  };

  let previewTimer: number | undefined;
  const renderPreview = () => {
    const main = iframe.contentDocument?.querySelector("main");
    if (!main) return;
    const { block, body } = splitFrontMatter(textarea.value);
    const fm = parseFrontMatter(textarea.value);
    const tags = parseTags(block).filter((t) => t !== "blog");
    main.innerHTML = `
      <h2 class="takanorip-blogTitle takanorip-blogHead">${escapeHtml(fm.title || "（無題）")}</h2>
      <div class="takanorip-blogInfo">
        <div class="takanorip-blogDate"><p class="takanorip-blogDateDate">${escapeHtml(formatDate(fm.date))}</p></div>
        <ul class="takanorip-blogTagList">${tags
          .map((t) => `<li class="takanorip-blogTagItem"><span class="takanorip-blogTagLink">${escapeHtml(t)}</span></li>`)
          .join("")}</ul>
      </div>
      <div class="takanorip-blogBoby">${renderMarkdown(body)}</div>`;
  };
  const schedulePreview = () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 150);
  };
  iframe.addEventListener("load", renderPreview);

  let backupTimer: number | undefined;
  const backupNow = () => {
    window.clearTimeout(backupTimer);
    if (isDirty()) {
      writeBackup(backupKey, {
        content: textarea.value,
        slug: slugInput.value.trim(),
        sha: state.sha,
        at: Date.now(),
      });
    } else {
      clearBackup(backupKey);
    }
  };
  const scheduleBackup = () => {
    window.clearTimeout(backupTimer);
    backupTimer = window.setTimeout(backupNow, 400);
  };

  const replaceContent = (content: string) => {
    const delta = content.length - textarea.value.length;
    const { selectionStart, selectionEnd } = textarea;
    const fmEnd = textarea.value.length - splitFrontMatter(textarea.value).body.length;
    textarea.value = content;
    if (selectionStart >= fmEnd) {
      textarea.setSelectionRange(selectionStart + delta, selectionEnd + delta);
    }
  };

  const save = async (mode: SaveMode) => {
    if (busy) return;
    const newSlug = slugInput.value.trim();
    if (!isValidSlug(newSlug)) {
      toast("ファイル名は英数字・ハイフン・アンダースコア・ドットのみ使えます", { error: true });
      slugInput.focus();
      return;
    }
    const renamed = !isNew() && newSlug !== state.slug;
    if (mode === "publish" && !confirm(`「${parseFrontMatter(textarea.value).title || newSlug}」を公開しますか？`)) return;
    if (mode === "unpublish" && !confirm("公開を取り消して下書きに戻しますか？")) return;
    if (
      renamed &&
      !savedIsDraft() &&
      !confirm(`公開済みの記事の URL が /posts/${newSlug}/ に変わります。古い URL はリンク切れになりますが、よろしいですか？`)
    ) {
      return;
    }

    const content = setDraft(textarea.value, mode === "draft" || mode === "unpublish");
    if (content !== textarea.value) replaceContent(content);

    busy = true;
    refresh();
    try {
      const res = await api<SaveResult>(`/posts/${encodeURIComponent(isNew() ? newSlug : state.slug)}`, {
        method: "PUT",
        body: JSON.stringify({ content, sha: state.sha, newSlug }),
      });
      clearBackup(backupKey);
      state = { slug: res.slug, sha: res.sha, saved: content };
      backupKey = res.slug;
      slugInput.value = res.slug;
      postsCache = null;
      const hash = `#/edit/${encodeURIComponent(res.slug)}`;
      if (location.hash !== hash) {
        history.replaceState(null, "", hash);
        currentHash = hash;
      }
      if (!res.changed) toast("変更はありません");
      else if (mode === "draft") toast("下書きを保存しました");
      else if (mode === "unpublish") toast("下書きに戻しました。数分でサイトから削除されます");
      else toast("公開しました。数分でサイトに反映されます");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast(e.message, {
          error: true,
          action: {
            label: "再読み込み",
            run: () => {
              backupNow();
              renderRoute();
            },
          },
        });
      } else {
        handleError(e);
      }
    } finally {
      busy = false;
      refresh();
    }
  };

  primaryBtn.addEventListener("click", () => save(savedIsDraft() ? "publish" : "update"));
  secondaryBtn.addEventListener("click", () => save(savedIsDraft() ? "draft" : "unpublish"));
  textarea.addEventListener("input", () => {
    refresh();
    schedulePreview();
    scheduleBackup();
  });
  slugInput.addEventListener("input", () => {
    refresh();
    scheduleBackup();
  });
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save(savedIsDraft() ? "draft" : "update");
    }
  });

  const backup = readBackup(backupKey);
  if (backup && (backup.content !== state.saved || backup.slug !== state.slug)) {
    const at = new Date(backup.at).toLocaleString("ja-JP");
    const stale = backup.sha !== state.sha;
    banner.hidden = false;
    banner.replaceChildren(
      h(
        "span",
        {},
        `${at} に編集した未保存の内容がこの端末に残っています。`,
        stale ? "（その後 GitHub 上で更新されています）" : "",
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn btn-small btn-primary",
          onclick: () => {
            textarea.value = backup.content;
            slugInput.value = backup.slug;
            banner.hidden = true;
            refresh();
            renderPreview();
          },
        },
        "復元する",
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn btn-small",
          onclick: () => {
            clearBackup(backupKey);
            banner.hidden = true;
          },
        },
        "破棄する",
      ),
    );
  }

  dirtyCheck = isDirty;

  root.replaceChildren(
    h(
      "div",
      { class: "editor-view" },
      h(
        "header",
        { class: "editor-header" },
        h(
          "div",
          { class: "editor-row" },
          h("a", { class: "btn btn-ghost back", href: "#/", "aria-label": "一覧に戻る" }, "←"),
          h("label", { class: "slug-field" }, h("span", {}, "/posts/"), slugInput, h("span", {}, "/")),
          status,
          dirtyMark,
          viewLink,
        ),
        h(
          "div",
          { class: "editor-row editor-actions" },
          h("div", { class: "tabs" }, ...tabs),
          h("span", { class: "spacer" }),
          secondaryBtn,
          primaryBtn,
        ),
      ),
      banner,
      panes,
    ),
  );
  refresh();
  if (isNewRoute) {
    const titleLine = textarea.value.indexOf("title: ") + "title: ".length;
    textarea.focus();
    textarea.setSelectionRange(titleLine, titleLine);
  }
};

const renderRoute = () => {
  dirtyCheck = null;
  const hash = location.hash;
  currentHash = hash;
  const edit = hash.match(/^#\/edit\/(.+)$/);
  if (hash === "#/new") renderEditor(null);
  else if (edit) renderEditor(decodeURIComponent(edit[1]));
  else renderList();
};

window.addEventListener("hashchange", () => {
  if (ignoreNextHashChange) {
    ignoreNextHashChange = false;
    return;
  }
  if (
    dirtyCheck?.() &&
    !confirm("保存していない変更があります。移動しますか？\n（編集内容はこの端末に一時保存されています）")
  ) {
    ignoreNextHashChange = true;
    location.hash = currentHash;
    return;
  }
  renderRoute();
});

window.addEventListener("beforeunload", (e) => {
  if (dirtyCheck?.()) e.preventDefault();
});

const start = async () => {
  try {
    me = await api<Me>("/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) renderLogin();
    else renderLogin(e instanceof Error ? e.message : String(e));
    return;
  }
  const returnTo = sessionStorage.getItem(RETURN_KEY);
  if (returnTo) {
    sessionStorage.removeItem(RETURN_KEY);
    if (returnTo !== location.hash) history.replaceState(null, "", returnTo || "#/");
  }
  renderRoute();
};

start();
