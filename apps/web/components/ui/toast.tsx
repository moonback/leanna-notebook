"use client";
import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";
type ToastItem = { id: number; title: string; description?: string; tone: Tone; action?: { label: string; onClick: () => void } };

// Petit bus d'événements : toast() appelable depuis n'importe quel composant client.
const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;
export function toast(t: Omit<ToastItem, "id" | "tone"> & { tone?: Tone }) {
  const item = { id: ++seq, tone: "info" as Tone, ...t };
  listeners.forEach((l) => l(item));
}

const icons = { info: Info, success: CheckCircle2, error: AlertTriangle };
const tones = { info: "text-accent", success: "text-success", error: "text-danger" };

/** Notifications : bas-droite (bas-centre sur mobile), 5 s, pause au survol, F8 pour y aller. Erreur = assertive. */
export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => {
    const l = (t: ToastItem) => setItems((xs) => [...xs.slice(-2), t]);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000} label="Notifications">
      {items.map((t) => {
        const Icon = icons[t.tone];
        return (
          <ToastPrimitive.Root
            key={t.id}
            type={t.tone === "error" ? "foreground" : "background"}
            onOpenChange={(open) => !open && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="mobile-toast glass-elevated flex w-full items-start gap-3 rounded-xl p-4 shadow-pop"
          >
            <Icon className={cn("mt-0.5 size-5 shrink-0", tones[t.tone])} aria-hidden />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
              {t.description && <ToastPrimitive.Description className="text-sm text-text-muted">{t.description}</ToastPrimitive.Description>}
              {t.action && (
                <ToastPrimitive.Action altText={t.action.label} asChild>
                  <button onClick={t.action.onClick} className="mt-1 justify-self-start text-sm font-semibold text-accent hover:underline">
                    {t.action.label}
                  </button>
                </ToastPrimitive.Action>
              )}
            </div>
            <ToastPrimitive.Close aria-label="Fermer" className="rounded-md p-1 text-text-muted hover:bg-surface hover:text-text">
              <X className="size-4" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="mobile-toast-viewport fixed bottom-4 left-1/2 z-[var(--z-toast)] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 outline-none sm:left-auto sm:right-4 sm:translate-x-0" />
    </ToastPrimitive.Provider>
  );
}
