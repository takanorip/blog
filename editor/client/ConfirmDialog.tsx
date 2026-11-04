import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { useRef, useSyncExternalStore } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
};
type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const confirm = (options: ConfirmOptions) =>
  new Promise<boolean>((resolve) => {
    current?.resolve(false);
    current = { ...options, resolve };
    emit();
  });

export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => current);
  // Keep rendering the last request while the close animation runs.
  const last = useRef<Request | null>(null);
  if (request) last.current = request;
  const shown = request ?? last.current;

  const close = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    current = null;
    emit();
  };

  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && close(false)}>
      <Dialog size="base" className="p-6">
        {shown && (
          <>
            <Dialog.Title className="text-lg font-semibold text-kumo-default">
              {shown.title}
            </Dialog.Title>
            {shown.description && (
              <Dialog.Description className="mt-2 whitespace-pre-line text-kumo-subtle">
                {shown.description}
              </Dialog.Description>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => close(false)}>
                キャンセル
              </Button>
              <Button
                variant={shown.destructive ? "destructive" : "primary"}
                onClick={() => close(true)}
              >
                {shown.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </Dialog.Root>
  );
}
