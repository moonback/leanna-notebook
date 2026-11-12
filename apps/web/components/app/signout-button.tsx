"use client";
import * as React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

/** Déconnexion avec confirmation en modale (POST /auth/signout). */
export function SignOutButton({ labeled = false }: { labeled?: boolean }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [confirm, confirmDialog] = useConfirm();
  return (
    <form ref={formRef} action="/auth/signout" method="post">
      <Button
        type="button"
        variant={labeled ? "secondary" : "ghost"}
        size={labeled ? "md" : "icon"}
        className={labeled ? "w-full gap-2" : undefined}
        aria-label="Se déconnecter"
        onClick={async () => {
          if (await confirm({ title: "Se déconnecter ?", description: "Vous devrez vous reconnecter pour retrouver vos notebooks.", confirmLabel: "Se déconnecter", tone: "primary" })) {
            formRef.current?.submit();
          }
        }}
      >
        <LogOut aria-hidden />{labeled && "Se déconnecter"}
      </Button>
      {confirmDialog}
    </form>
  );
}
