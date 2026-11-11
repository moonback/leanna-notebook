"use client";
import * as React from "react";
import { Copy, MoreHorizontal, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlay";
import { useCopyNotebook } from "./copy-button";
import { ShareButton } from "./share-dialog";

/** Menu regroupant « Faire une copie » et « Partager » dans l'en-tête du notebook. */
export function NotebookActionsMenu({ notebookId, allowCopies, canCopy, canShare }: { notebookId: string; allowCopies: boolean; canCopy: boolean; canShare: boolean }) {
  const { busy, copy } = useCopyNotebook(notebookId);
  const [shareOpen, setShareOpen] = React.useState(false);
  if (!canCopy && !canShare) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Actions du notebook"><MoreHorizontal aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canCopy && <DropdownMenuItem icon={<Copy aria-hidden />} disabled={busy} onSelect={() => void copy()}>Faire une copie</DropdownMenuItem>}
          {canShare && <DropdownMenuItem icon={<Share2 aria-hidden />} onSelect={() => setShareOpen(true)}>Partager</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {canShare && <ShareButton notebookId={notebookId} allowCopies={allowCopies} open={shareOpen} onOpenChange={setShareOpen} />}
    </>
  );
}
