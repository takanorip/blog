import { useEffect, useRef } from "react";
import { previewDocument, renderArticle } from "./article";

type Props = { content: string; active: boolean };

export function Preview({ content, active }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(content);
  latest.current = content;

  const render = () => {
    const main = frame.current?.contentDocument?.querySelector("main");
    if (main) main.innerHTML = renderArticle(latest.current);
  };

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(render, 150);
    return () => window.clearTimeout(timer);
  }, [content, active]);

  useEffect(() => {
    if (active) render();
  }, [active]);

  return (
    <iframe
      ref={frame}
      title="プレビュー"
      className="block size-full border-0 bg-white"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={previewDocument(location.origin)}
      onLoad={render}
    />
  );
}
