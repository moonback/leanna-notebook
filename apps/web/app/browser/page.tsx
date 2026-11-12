import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { getUser } from "@/lib/supabase/server";
import { BrowserClient } from "./browser-client";

export const metadata: Metadata = { title: "Leanna Browser" };

export default async function BrowserPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/browser");
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader hideFeedback>
        <span className="truncate text-sm font-semibold">Leanna Browser</span>
      </AppHeader>
      <BrowserClient />
    </div>
  );
}
