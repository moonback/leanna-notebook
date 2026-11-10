"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlay";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (défaut) pour les actions destructives, "primary" sinon. */
  tone?: "danger" | "primary";
};

/**
 * Remplace `window.confirm` par une modale accessible.
 * Usage : const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: "Supprimer ?" }))) return;
 * puis rendre {confirmDialog} dans le JSX du composant.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolver = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const settle = React.useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  }, []);

  const node = (
    <Dialog open={opts !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      {opts && (
        <DialogContent size="sm" title={opts.title} description={opts.description}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">{opts.cancelLabel ?? "Annuler"}</Button>
            </DialogClose>
            <Button type="button" variant={opts.tone === "primary" ? "primary" : "danger"} onClick={() => settle(true)}>
              {opts.confirmLabel ?? "Confirmer"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );

  return [confirm, node];
}
