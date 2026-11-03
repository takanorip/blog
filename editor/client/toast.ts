import { createKumoToastManager } from "@cloudflare/kumo/components/toast";
import { ApiError, login } from "./api";

export const toastManager = createKumoToastManager();

type ToastOptions = {
  error?: boolean;
  description?: string;
  action?: { label: string; run: () => void };
};

export const toast = (title: string, opts: ToastOptions = {}) =>
  toastManager.add({
    title,
    description: opts.description,
    variant: opts.error ? "error" : "default",
    timeout: opts.action ? 10000 : 4000,
    actions: opts.action
      ? [{ children: opts.action.label, onClick: opts.action.run, variant: "primary" }]
      : undefined,
  });

export const handleError = (e: unknown) => {
  if (e instanceof ApiError && e.status === 401) {
    toast("ログインが切れました", {
      error: true,
      description: "編集内容はこの端末に保存されています",
      action: { label: "ログイン", run: login },
    });
    return;
  }
  toast(e instanceof Error ? e.message : String(e), { error: true });
};
