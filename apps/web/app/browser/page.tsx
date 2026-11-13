import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { canUseBrowser } from "@/lib/browser/access";
import { getUser } from "@/lib/supabase/server";
import { BrowserClient } from "./browser-client";
import { ProRequired } from "./pro-required";

export const metadata: Metadata = { title: "Leanna Browser" };

export default async function BrowserPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/browser");
  const allowed = await canUseBrowser(user.id);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader hideFeedback>
        <span className="truncate text-sm font-semibold">Leanna Browser</span>
      </AppHeader>
      {allowed ? <BrowserClient /> : <ProRequired />}
    </div>
  );
}
