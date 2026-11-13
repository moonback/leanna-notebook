"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ----- Modale : piège le focus, Échap ferme, titre obligatoire (lu à l'ouverture). ----- */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title, description, children, size = "md", className,
}: { title: string; description?: string; children: React.ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="glass-backdrop fixed inset-0 z-[var(--z-overlay)]" />
      <DialogPrimitive.Content
        className={cn(
          "glass-dialog glass-elevated fixed left-1/2 top-1/2 z-[var(--z-dialog)] grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl p-6 shadow-dialog",
          { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" }[size],
          className,
        )}
      >
        <div className="grid gap-1 pr-8">
          <DialogPrimitive.Title className="text-xl">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-text-muted">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        {children}
        <DialogPrimitive.Close
          aria-label="Fermer"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ----- Menu ⋮ : flèches, Entrée, Échap, saisie par première lettre (Radix). ----- */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ children, align = "end" }: { children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className="glass-elevated z-[var(--z-dropdown)] min-w-48 rounded-lg p-1 shadow-pop"
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  icon, danger, children, ...props
}: Menu.DropdownMenuItemProps & { icon?: React.ReactNode; danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface [&_svg]:size-4",
        danger ? "text-danger" : "text-text",
      )}
      {...props}
    >
      {icon}
      {children}
    </Menu.Item>
  );
}
export const DropdownMenuSeparator = () => <Menu.Separator className="my-1 h-px bg-border" />;

/* ----- Infobulle : complète un libellé, ne le remplace jamais (aria-label reste requis). ----- */
export function Tooltip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-[var(--z-tooltip)] max-w-80 rounded-md bg-text px-2.5 py-1.5 text-xs text-bg shadow-pop"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
