import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { InputGroup } from "@cloudflare/kumo/components/input-group";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ClockCounterClockwiseIcon,
  FileXIcon,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isValidSlug,
  newPostTemplate,
  parseFrontMatter,
  setDraft,
  splitFrontMatter,
} from "../shared/frontmatter";
import {
  api,
  ApiError,
  type Backup,
  clearBackup,
  invalidatePosts,
  loadPosts,
  type Post,
  readBackup,
  type SaveResult,
  writeBackup,
} from "./api";
import { confirm } from "./ConfirmDialog";
import { Preview } from "./Preview";
import { handleError, toast } from "./toast";

type Saved = { slug: string; sha: string | null; saved: string };
type SaveMode = "draft" | "publish" | "unpublish" | "update";
type Tab = "edit" | "preview";

export type EditorProps = {
  slug: string | null;
  setGuard: (guard: (() => boolean) | null) => void;
  replaceRoute: (hash: string) => void;
  reload: () => void;
};

const todayInTokyo = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

export function Editor(props: EditorProps) {
  const [initial, setInitial] = useState<Saved | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let saved: Saved;
        if (props.slug === null) {
          const taken = new Set((await loadPosts()).map((p) => p.slug));
          const base = todayInTokyo();
          let candidate = base;
          for (let i = 2; taken.has(candidate); i++) candidate = `${base}-${i}`;
          saved = { slug: candidate, sha: null, saved: newPostTemplate(base) };
        } else {
          const post = await api<Post>(`/posts/${encodeURIComponent(props.slug)}`);
          saved = { slug: post.slug, sha: post.sha, saved: post.content };
        }
        if (!cancelled) setInitial(saved);
      } catch (e) {
        handleError(e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-full flex-col">
        <EditorBar>
          <BackButton />
        </EditorBar>
        <Empty
          className="mt-16"
          icon={<FileXIcon size={32} />}
          title="記事を読み込めませんでした"
          contents={<LinkButton href="#/">一覧に戻る</LinkButton>}
        />
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="flex h-full flex-col">
        <EditorBar>
          <BackButton />
        </EditorBar>
        <div className="flex flex-1 items-center justify-center">
          <Loader size={24} />
        </div>
      </div>
    );
  }
  return <EditorView {...props} initial={initial} />;
}

function EditorBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-2 sm:px-4">{children}</div>
  );
}

function BackButton() {
  return (
    <LinkButton href="#/" variant="ghost" shape="square" aria-label="一覧に戻る">
      <ArrowLeftIcon />
    </LinkButton>
  );
}

function EditorView({
  slug: routeSlug,
  initial,
  setGuard,
  replaceRoute,
  reload,
}: EditorProps & { initial: Saved }) {
  const [saved, setSaved] = useState(initial);
  const [content, setContent] = useState(initial.saved);
  const [slugValue, setSlugValue] = useState(initial.slug);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("edit");
  const backupKey = useRef(initial.sha === null ? "new" : initial.slug);
  const [backup, setBackup] = useState<Backup | null>(() => {
    const b = readBackup(backupKey.current);
    return b && (b.content !== initial.saved || b.slug !== initial.slug) ? b : null;
  });
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  const isNew = saved.sha === null;
  const savedIsDraft = isNew || parseFrontMatter(saved.saved).draft;
  const nextSlug = slugValue.trim();
  const slugValid = isValidSlug(nextSlug);
  const dirty = content !== saved.saved || nextSlug !== saved.slug;

  const latest = useRef({ content, nextSlug, saved, dirty });
  latest.current = { content, nextSlug, saved, dirty };

  const backupNow = () => {
    const { content, nextSlug, saved, dirty } = latest.current;
    if (dirty) {
      writeBackup(backupKey.current, {
        content,
        slug: nextSlug,
        sha: saved.sha,
        at: Date.now(),
      });
    } else {
      clearBackup(backupKey.current);
    }
  };

  useEffect(() => {
    setGuard(() => latest.current.dirty);
    return () => setGuard(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(backupNow, 400);
    return () => window.clearTimeout(timer);
  }, [content, slugValue]);

  useLayoutEffect(() => {
    if (!pendingSelection.current || !textarea.current) return;
    textarea.current.setSelectionRange(...pendingSelection.current);
    pendingSelection.current = null;
  }, [content]);

  useEffect(() => {
    if (routeSlug !== null || !textarea.current) return;
    const pos = initial.saved.indexOf("title: ") + "title: ".length;
    textarea.current.focus();
    textarea.current.setSelectionRange(pos, pos);
  }, []);

  const replaceContent = (next: string) => {
    const el = textarea.current;
    if (el) {
      const delta = next.length - content.length;
      const bodyStart = content.length - splitFrontMatter(content).body.length;
      if (el.selectionStart >= bodyStart) {
        pendingSelection.current = [el.selectionStart + delta, el.selectionEnd + delta];
      }
    }
    setContent(next);
  };

  const save = async (mode: SaveMode) => {
    if (busy) return;
    if (!slugValid) {
      toast("ファイル名は英数字・ハイフン・アンダースコア・ドットのみ使えます", {
        error: true,
      });
      return;
    }
    const renamed = !isNew && nextSlug !== saved.slug;
    const title = parseFrontMatter(content).title || nextSlug;
    if (
      mode === "publish" &&
      !(await confirm({ title: `「${title}」を公開しますか？`, confirmLabel: "公開する" }))
    ) {
      return;
    }
    if (
      mode === "unpublish" &&
      !(await confirm({
        title: "公開を取り消して下書きに戻しますか？",
        description: "数分でサイトから削除されます。",
        confirmLabel: "下書きに戻す",
        destructive: true,
      }))
    ) {
      return;
    }
    if (
      renamed &&
      !savedIsDraft &&
      !(await confirm({
        title: "公開済みの記事の URL を変更しますか？",
        description: `/posts/${saved.slug}/ → /posts/${nextSlug}/\n古い URL はリンク切れになります。`,
        confirmLabel: "変更して保存",
        destructive: true,
      }))
    ) {
      return;
    }

    const next = setDraft(content, mode === "draft" || mode === "unpublish");
    if (next !== content) replaceContent(next);

    setBusy(true);
    try {
      const res = await api<SaveResult>(
        `/posts/${encodeURIComponent(isNew ? nextSlug : saved.slug)}`,
        { method: "PUT", body: JSON.stringify({ content: next, sha: saved.sha, newSlug: nextSlug }) },
      );
      clearBackup(backupKey.current);
      backupKey.current = res.slug;
      setSaved({ slug: res.slug, sha: res.sha, saved: next });
      setSlugValue(res.slug);
      setBackup(null);
      invalidatePosts();
      replaceRoute(`#/edit/${encodeURIComponent(res.slug)}`);
      if (!res.changed) toast("変更はありません");
      else if (mode === "draft") toast("下書きを保存しました");
      else if (mode === "unpublish") toast("下書きに戻しました", { description: "数分でサイトから削除されます" });
      else toast("公開しました", { description: "数分でサイトに反映されます" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast(e.message, {
          error: true,
          action: {
            label: "再読み込み",
            run: () => {
              backupNow();
              reload();
            },
          },
        });
      } else {
        handleError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const draft = latest.current.saved.sha === null || parseFrontMatter(latest.current.saved.saved).draft;
        saveRef.current(draft ? "draft" : "update");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const restore = () => {
    if (!backup) return;
    setContent(backup.content);
    setSlugValue(backup.slug);
    setBackup(null);
  };
  const discard = () => {
    clearBackup(backupKey.current);
    setBackup(null);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-kumo-hairline bg-kumo-base">
        <EditorBar>
          <BackButton />
          <InputGroup size="sm" className="min-w-0 flex-1">
            <InputGroup.Addon className="font-mono">/posts/</InputGroup.Addon>
            <InputGroup.Input
              className="font-mono"
              aria-label="ファイル名（URL）"
              aria-invalid={!slugValid}
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              value={slugValue}
              onChange={(e) => setSlugValue(e.target.value)}
            />
            <InputGroup.Addon align="end" className="font-mono">
              /
            </InputGroup.Addon>
          </InputGroup>
          <Badge variant={isNew ? "info" : savedIsDraft ? "warning" : "success"}>
            {isNew ? "新規" : savedIsDraft ? "下書き" : "公開中"}
          </Badge>
          {dirty && (
            <span
              className="size-2 shrink-0 rounded-full bg-kumo-warning"
              title="未保存の変更があります"
              aria-label="未保存の変更があります"
            />
          )}
          {!savedIsDraft && (
            <LinkButton
              href={`/posts/${encodeURIComponent(saved.slug)}/`}
              external
              variant="ghost"
              size="sm"
              aria-label="サイトで見る"
              icon={ArrowSquareOutIcon}
            >
              <span className="hidden sm:inline">サイトで見る</span>
            </LinkButton>
          )}
        </EditorBar>
        <div className="flex items-center gap-2 px-2 pb-2 sm:px-4">
          <Tabs
            variant="segmented"
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            tabs={[
              { value: "edit", label: "編集" },
              { value: "preview", label: "プレビュー" },
            ]}
          />
          <span className="flex-1" />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => save(savedIsDraft ? "draft" : "unpublish")}
          >
            {savedIsDraft ? "下書き保存" : "下書きに戻す"}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => save(savedIsDraft ? "publish" : "update")}
          >
            {savedIsDraft ? "公開する" : "更新する"}
          </Button>
        </div>
      </header>

      {backup && (
        <Banner
          className="m-2 sm:mx-4"
          variant="alert"
          icon={<ClockCounterClockwiseIcon />}
          description={`${new Date(backup.at).toLocaleString("ja-JP")} に編集した未保存の内容がこの端末に残っています。${
            backup.sha !== saved.sha ? "（その後 GitHub 上で更新されています）" : ""
          }`}
          action={
            <div className="flex gap-2">
              <Banner.Action variant="primary" onClick={restore}>
                復元する
              </Banner.Action>
              <Banner.Action variant="secondary" onClick={discard}>
                破棄する
              </Banner.Action>
            </div>
          }
        />
      )}

      <div className="relative min-h-0 flex-1">
        <textarea
          ref={textarea}
          hidden={tab !== "edit"}
          aria-label="本文"
          spellCheck={false}
          autoCapitalize="off"
          className="block size-full resize-none border-0 bg-kumo-base px-[max(1.25rem,env(safe-area-inset-left),calc((100%-48rem)/2))] pt-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-base leading-[1.8] text-kumo-default outline-none [tab-size:2]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div hidden={tab !== "preview"} className="size-full">
          <Preview content={content} active={tab === "preview"} />
        </div>
      </div>
    </div>
  );
}
