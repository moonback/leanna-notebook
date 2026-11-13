import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex h-5 items-center gap-1 rounded-pill px-2 text-2xs uppercase", {
  variants: {
    tone: {
      neutral: "bg-surface-sunken text-text-muted",
      accent: "bg-accent-soft text-on-accent-soft",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Squelette : formes du contenu à venir, jamais seul (le parent porte aria-busy). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** Barre de progression déterminée (jobs) ; sans `value` = indéterminée. */
export function Progress({ value, label }: { value?: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken"
    >
      <div
        className={cn("h-full rounded-pill bg-accent transition-[width] duration-300", value === undefined && "skeleton w-1/3")}
        style={value !== undefined ? { width: `${value}%` } : undefined}
      />
    </div>
  );
}

/** État vide : icône (Lucide, décorative), titre, explication, action principale. */
export function EmptyState({
  icon, title, children, action, className,
}: { icon: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mobile-empty-state flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div aria-hidden className="mobile-empty-state-icon grid size-12 place-items-center rounded-xl bg-accent-soft text-on-accent-soft [&_svg]:size-6">
        {icon}
      </div>
      <h3 className="mobile-empty-state-title text-lg font-semibold tracking-tight">{title}</h3>
      {children && <p className="max-w-sm text-sm text-pretty text-text-muted">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Bandeau contextuel (quota, erreur d'import, limite atteinte). */
export function Alert({
  tone = "accent", title, children, action,
}: { tone?: "accent" | "warning" | "danger" | "success"; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const tones = {
    accent: "bg-accent-soft text-on-accent-soft",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("mobile-inline-alert flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-3 text-sm", tones[tone])}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <p className="opacity-90">{children}</p>}
      </div>
      {action}
    </div>
  );
}
