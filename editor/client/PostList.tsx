import { Badge } from "@cloudflare/kumo/components/badge";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Text } from "@cloudflare/kumo/components/text";
import {
  ArrowClockwiseIcon,
  FileDashedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SignOutIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { loadPosts, type Me, type Summary } from "./api";
import { handleError } from "./toast";

type Filter = "all" | "draft" | "published";

type Props = { me: Me; onLogout: () => void };

export function PostList({ me, onLogout }: Props) {
  const [posts, setPosts] = useState<Summary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = async (force = false) => {
    setLoading(true);
    try {
      setPosts(await loadPosts(force));
      setFailed(false);
    } catch (e) {
      handleError(e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter(
      (p) =>
        (filter === "all" || (filter === "draft") === p.draft) &&
        (!q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
    );
  }, [posts, filter, query]);

  const drafts = posts?.filter((p) => p.draft).length ?? 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-kumo-hairline bg-kumo-base">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2">
          <a href="#/" className="font-semibold text-kumo-default no-underline">
            Blog Editor
          </a>
          <span className="flex-1" />
          <Text variant="secondary" size="sm">
            {me.login}
          </Text>
          <Button variant="ghost" size="sm" icon={SignOutIcon} onClick={onLogout}>
            ログアウト
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-kumo-subtle" />
            <Input
              type="search"
              className="w-full pl-9"
              placeholder="タイトル・ファイル名で検索"
              aria-label="検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <LinkButton href="#/new" variant="primary" icon={PlusIcon}>
            新規作成
          </LinkButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            variant="segmented"
            size="sm"
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            tabs={[
              { value: "all", label: "すべて" },
              { value: "draft", label: "下書き" },
              { value: "published", label: "公開中" },
            ]}
          />
          <span className="flex-1" />
          {posts && (
            <Text variant="secondary" size="sm">
              {posts.length} 件（下書き {drafts} 件）
            </Text>
          )}
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="一覧を更新"
            icon={ArrowClockwiseIcon}
            loading={loading && posts !== null}
            onClick={() => load(true)}
          />
        </div>

        {posts === null && !failed ? (
          <div className="flex justify-center py-16">
            <Loader size={24} />
          </div>
        ) : failed && posts === null ? (
          <Empty
            icon={<FileDashedIcon size={32} />}
            title="読み込みに失敗しました"
            contents={<Button onClick={() => load(true)}>再試行</Button>}
          />
        ) : shown.length === 0 ? (
          <Empty icon={<FileDashedIcon size={32} />} title="記事がありません" />
        ) : (
          <ul className="m-0 list-none divide-y divide-kumo-hairline overflow-hidden rounded-lg border border-kumo-hairline bg-kumo-base p-0">
            {shown.map((p) => (
              <li key={p.slug}>
                <a
                  href={`#/edit/${encodeURIComponent(p.slug)}`}
                  className="flex flex-col gap-1 px-4 py-3 text-kumo-default no-underline hover:bg-kumo-tint"
                >
                  <span className="font-medium break-words">{p.title || "（無題）"}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-kumo-subtle">
                    {p.draft && <Badge variant="warning">下書き</Badge>}
                    <span>{p.date ? p.date.slice(0, 10) : ""}</span>
                    <span className="min-w-0 truncate font-mono text-xs">/posts/{p.slug}/</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
