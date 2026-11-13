import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { canUseBrowser } from "@/lib/browser/access";
import { getUser } from "@/lib/supabase/server";
import { BrowserClient } from "@/app/browser/browser-client";
import { ProRequired } from "@/app/browser/pro-required";

export const metadata: Metadata = { title: "Navigateur — Leanna Notebook" };

export default async function NotebookBrowserPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  const { id } = await params;
  if (!user) redirect("/login?next=" + encodeURIComponent("/notebook/" + id + "/browser"));
  const allowed = await canUseBrowser(user.id);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader hideFeedback>
        <span className="truncate text-sm font-semibold">Navigateur — Notebook</span>
      </AppHeader>
      {allowed ? <BrowserClient notebookId={id} /> : <ProRequired />}
    </div>
  );
}
