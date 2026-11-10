import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { createUserClient, getUser } from "@/lib/supabase/server";
import "./globals.css";

// Polices sous licence OFL, auto-hébergées par next/font au build.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Notebook",
  description: "Comprenez vos documents, réponses sourcées.",
};

async function getInitialTheme(): Promise<"light" | "dark" | null> {
  try {
    const user = await getUser();
    if (!user) return null;
    const supabase = await createUserClient();
    const { data } = await supabase.from("profiles").select("theme").eq("id", user.id).maybeSingle();
    return data?.theme === "light" || data?.theme === "dark" ? data.theme : null;
  } catch {
    // Le thème système reste le repli sûr si la session ou le profil est indisponible.
    return null;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await getInitialTheme();
  return (
    <html lang="fr" data-theme={theme ?? undefined} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
