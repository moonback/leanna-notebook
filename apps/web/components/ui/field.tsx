import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border-input bg-surface-raised px-3 text-sm text-text placeholder:text-text-subtle transition-colors duration-150 focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60 aria-invalid:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, "h-9", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(control, "min-h-24 resize-y py-2 leading-6", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Champ complet : libellé, aide et erreur reliés par aria-describedby. */
export function Field({
  label, hint, error, children, id,
}: { label: string; hint?: string; error?: string; id: string; children: React.ReactElement<Record<string, unknown>> }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">{label}</label>
      {React.cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/** Recherche (tableau de bord, sources). Le libellé est porté par aria-label. */
export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
      <input type="search" className={cn(control, "h-9 rounded-pill pl-9")} {...props} />
    </div>
  );
}
