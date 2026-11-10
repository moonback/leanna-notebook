"use client";
import * as React from "react";
import * as Popover from "@radix-ui/react-tooltip";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pastille de citation [n] — signature du produit.
 * Survol / focus : extrait cité + source. Clic / Entrée : ouvre la source au passage (onOpen).
 * `verified=false` : citation non retrouvée mot pour mot dans la source, signalée visuellement ET en texte.
 */
export function Citation({
  n, source, quote, verified = true, onOpen,
}: { n: number; source: string; quote: string; verified?: boolean; onOpen?: () => void }) {
  return (
    <Popover.Provider delayDuration={150}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Citation ${n}, ${source}${verified ? "" : ", non vérifiée"}`}
            className={cn(
              "mx-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-xs px-1 align-[0.1em] font-mono text-[0.68rem] font-semibold leading-none transition-colors",
              verified
                ? "bg-accent-soft text-on-accent-soft hover:bg-accent hover:text-on-accent"
                : "border border-dashed border-warning bg-warning-soft text-warning",
            )}
          >
            {n}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={6}
            className="z-[var(--z-tooltip)] w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-surface-raised p-3 shadow-pop"
          >
            <p className="mb-1.5 truncate text-xs font-medium text-text-muted">{source}</p>
            <blockquote className="border-l-2 border-accent pl-3 font-serif text-sm leading-6 text-text">
              <mark className="bg-highlight text-on-highlight">{quote}</mark>
            </blockquote>
            {!verified && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                <ShieldAlert className="size-3.5" aria-hidden /> Passage non retrouvé à l’identique dans la source.
              </p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Popover.Provider>
  );
}
