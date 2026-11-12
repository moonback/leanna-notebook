import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// Polices sous licence OFL, auto-hébergées par next/font au build.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Leanna Notebook — Rechercher, comprendre, structurer", template: "%s · Leanna Notebook" },
  description: "Centralisez vos PDF, pages web et contenus. Interrogez vos sources avec l’IA et retrouvez les passages qui justifient chaque réponse.",
  applicationName: "Leanna Notebook",
  openGraph: {
    title: "Leanna Notebook — Vos sources ont des réponses",
    description: "Un espace de recherche documentaire pour collecter, comprendre et structurer vos connaissances.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
