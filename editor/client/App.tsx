import { Loader } from "@cloudflare/kumo/components/loader";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Me, takeReturnHash } from "./api";
import { confirm, ConfirmHost } from "./ConfirmDialog";
import { Editor } from "./Editor";
import { LoginScreen } from "./LoginScreen";
import { PostList } from "./PostList";

type Auth =
  | { state: "loading" }
  | { state: "out"; message?: string }
  | { state: "in"; me: Me };

const parseRoute = (hash: string) => {
  if (hash === "#/new") return { name: "editor" as const, slug: null };
  const edit = hash.match(/^#\/edit\/(.+)$/);
  if (edit) return { name: "editor" as const, slug: decodeURIComponent(edit[1]) };
  return { name: "list" as const };
};

export function App() {
  const [auth, setAuth] = useState<Auth>({ state: "loading" });
  // `key` changes on real navigations so screens remount; replaceRoute keeps it.
  const [route, setRoute] = useState({ hash: location.hash, key: 0 });
  const guard = useRef<(() => boolean) | null>(null);
  const currentHash = useRef(location.hash);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<Me>("/me");
        const returnTo = takeReturnHash();
        if (returnTo !== null && returnTo !== location.hash) {
          history.replaceState(null, "", returnTo || "#/");
          currentHash.current = location.hash;
          setRoute((r) => ({ hash: location.hash, key: r.key + 1 }));
        }
        setAuth({ state: "in", me });
      } catch (e) {
        setAuth({
          state: "out",
          message:
            e instanceof ApiError && e.status === 401
              ? undefined
              : e instanceof Error
                ? e.message
                : String(e),
        });
      }
    })();
  }, []);

  useEffect(() => {
    let ignoreNext = false;
    const onHashChange = async () => {
      if (ignoreNext) {
        ignoreNext = false;
        return;
      }
      const target = location.hash;
      if (guard.current?.()) {
        ignoreNext = true;
        location.hash = currentHash.current;
        const ok = await confirm({
          title: "保存していない変更があります",
          description: "移動しますか？（編集内容はこの端末に一時保存されています）",
          confirmLabel: "移動する",
          destructive: true,
        });
        if (!ok) return;
        guard.current = null;
        location.hash = target;
        return;
      }
      currentHash.current = target;
      setRoute((r) => ({ hash: target, key: r.key + 1 }));
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (guard.current?.()) e.preventDefault();
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const replaceRoute = (hash: string) => {
    if (location.hash === hash) return;
    history.replaceState(null, "", hash);
    currentHash.current = hash;
    setRoute((r) => ({ ...r, hash }));
  };

  const reload = () => {
    guard.current = null;
    setRoute((r) => ({ ...r, key: r.key + 1 }));
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setAuth({ state: "out", message: "ログアウトしました。" });
  };

  let screen: React.ReactNode;
  if (auth.state === "loading") {
    screen = (
      <div className="flex h-full items-center justify-center">
        <Loader size={24} />
      </div>
    );
  } else if (auth.state === "out") {
    screen = <LoginScreen message={auth.message} />;
  } else {
    const parsed = parseRoute(route.hash);
    screen =
      parsed.name === "editor" ? (
        <Editor
          key={route.key}
          slug={parsed.slug}
          setGuard={(g) => (guard.current = g)}
          replaceRoute={replaceRoute}
          reload={reload}
        />
      ) : (
        <PostList key={route.key} me={auth.me} onLogout={logout} />
      );
  }

  return (
    <>
      {screen}
      <ConfirmHost />
    </>
  );
}
