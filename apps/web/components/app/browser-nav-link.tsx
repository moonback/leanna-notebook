"use client";

import * as React from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasBrowserPlan } from "@/lib/browser/access-plan";

/** Lien vers Leanna Browser, affiché uniquement pour les abonnements Pro. */
export function BrowserNavLink() {
  const [allowed, setAllowed] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/v1/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { workspaces?: { kind: string; plan_id: string }[] } | null) => {
        const personal = me?.workspaces?.find((w) => w.kind === "personal");
        if (alive) setAllowed(hasBrowserPlan(personal?.plan_id));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!allowed) return null;
  return (
    <Button asChild variant="ghost" size="sm" className="gap-1.5">
      <Link href="/browser" aria-label="Ouvrir Leanna Browser"><Globe aria-hidden /><span className="hidden md:inline">Browser</span></Link>
    </Button>
  );
}
