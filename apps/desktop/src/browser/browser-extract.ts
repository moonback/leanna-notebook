import { readFileSync } from "node:fs";
import type { BrowserManager } from "./browser-manager";
import { extractPageScript, selectionScript } from "./page-scripts";
import { isSafeBrowserUrl } from "./browser-validation";

export type PageContent = {
  /** ok = contenu exploitable ; empty = page chargée mais sans texte ; unavailable = page inaccessible. */
  status: "ok" | "empty" | "unavailable";
  reason?: string;
  url: string;
  title: string;
  description: string;
  siteName: string;
  author: string;
  lang: string;
  publishedAt: string | null;
  canonicalUrl: string | null;
  /** Texte principal nettoyé et borné (segments séparés par une ligne vide). */
  text: string;
  /** Vrai si le texte a été coupé pour respecter la borne. */
  truncated: boolean;
  totalChars: number;
  wordCount: number;
  method: "readability" | "fallback" | "none";
  headings: { level: number; text: string }[];
  links: { text: string; url: string }[];
  tables: { caption: string; rows: string[][] }[];
};

/** Contexte envoyé au modèle : ~6 000 tokens. Jamais le DOM, jamais la page entière par défaut. */
export const AI_CONTEXT_CHARS = 24_000;
/** Enregistrement dans le Notebook : texte complet, dans la limite acceptée par l'API des sources. */
export const FULL_TEXT_CHARS = 1_000_000;
const SEGMENT_CHARS = 1_200;

/** Normalise un texte extrait : caractères de contrôle et invisibles retirés, blancs et sauts de ligne réduits. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Contrôles (hors \n et \t) et caractères invisibles ou de direction, souvent utilisés pour cacher du texte.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Regroupe les paragraphes en segments d'environ `size` caractères, sans couper un paragraphe court. */
export function segmentText(text: string, size = SEGMENT_CHARS): string[] {
  const segments: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    for (let offset = 0; offset < paragraph.length || offset === 0; offset += size) {
      const piece = paragraph.slice(offset, offset + size);
      if (!piece) break;
      if (current && current.length + piece.length + 1 > size) { segments.push(current); current = ""; }
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) segments.push(current);
  return segments;
}

/** Garde les premiers segments entiers qui tiennent dans `maxChars`. */
export function boundSegments(segments: string[], maxChars: number): { text: string; truncated: boolean } {
  const kept: string[] = [];
  let used = 0;
  for (const segment of segments) {
    const cost = segment.length + (kept.length ? 2 : 0);
    if (used + cost > maxChars) {
      if (kept.length === 0) kept.push(segment.slice(0, maxChars));
      return { text: kept.join("\n\n"), truncated: true };
    }
    kept.push(segment);
    used += cost;
  }
  return { text: kept.join("\n\n"), truncated: false };
}

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? cleanText(value).replace(/\n+/g, " ").slice(0, max) : "";

export function unavailablePage(url: string, title: string, reason: string): PageContent {
  return {
    status: "unavailable", reason, url, title, description: "", siteName: "", author: "", lang: "", publishedAt: null,
    canonicalUrl: null, text: "", truncated: false, totalChars: 0, wordCount: 0, method: "none", headings: [], links: [], tables: [],
  };
}

/**
 * Transforme le résultat brut du script de page (non fiable : la page peut renvoyer n'importe quoi)
 * en contenu typé, nettoyé, segmenté et borné.
 */
export function buildPageContent(raw: unknown, tabUrl: string, tabTitle: string, maxChars = AI_CONTEXT_CHARS): PageContent {
  if (!raw || typeof raw !== "object") return unavailablePage(tabUrl, tabTitle, "extraction_failed");
  const input = raw as Record<string, unknown>;
  const cleaned = cleanText(typeof input.text === "string" ? input.text : "");
  const { text, truncated } = boundSegments(segmentText(cleaned), maxChars);
  const list = (value: unknown, max: number): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === "object").slice(0, max) as Record<string, unknown>[] : [];
  const canonical = typeof input.canonicalUrl === "string" && isSafeBrowserUrl(input.canonicalUrl) ? input.canonicalUrl : null;
  const published = str(input.publishedAt, 40);
  return {
    status: cleaned.length >= 40 ? "ok" : "empty",
    // L'URL fait foi côté Main (celle de l'onglet), pas celle que déclare la page.
    url: tabUrl,
    title: str(input.title, 300) || tabTitle,
    description: str(input.description, 1000),
    siteName: str(input.siteName, 120),
    author: str(input.author, 200),
    lang: str(input.lang, 20),
    publishedAt: published && !Number.isNaN(Date.parse(published)) ? published : null,
    canonicalUrl: canonical,
    text, truncated, totalChars: cleaned.length,
    wordCount: cleaned ? cleaned.split(/\s+/).length : 0,
    method: input.method === "readability" ? "readability" : "fallback",
    headings: list(input.headings, 60).map((item) => ({ level: Math.min(3, Math.max(1, Number(item.level) || 1)), text: str(item.text, 200) }))
      .filter((item) => item.text),
    links: list(input.links, 200).filter((item) => isSafeBrowserUrl(item.url))
      .map((item) => ({ text: str(item.text, 120), url: item.url as string })),
    tables: list(input.tables, 10).map((item) => ({
      caption: str(item.caption, 200),
      rows: (Array.isArray(item.rows) ? item.rows : []).slice(0, 60)
        .map((row) => (Array.isArray(row) ? row : []).slice(0, 12).map((cell) => str(cell, 200))),
    })).filter((table) => table.rows.length > 0),
  };
}

let readabilitySource: string | null = null;
/** Source de Readability.js, injectée comme prélude dans le monde isolé de la page. */
function readabilityPrelude(): string[] {
  try {
    readabilitySource ??= readFileSync(require.resolve("@mozilla/readability/Readability.js"), "utf8");
    return [readabilitySource];
  } catch {
    return []; // le script d'extraction bascule alors sur son repli heuristique
  }
}

/** Extrait le contenu d'un onglet. Ne lève jamais : une page inaccessible est signalée comme telle. */
export async function extractPage(manager: BrowserManager, tabId: string, options: { full?: boolean } = {}): Promise<PageContent> {
  const tab = manager.getTab(tabId);
  if (!tab) return unavailablePage("", "", "tab_not_found");
  if (tab.crashed) return unavailablePage(tab.url, tab.title, "tab_crashed");
  if (tab.error) return unavailablePage(tab.url, tab.title, "page_load_failed");
  if (!isSafeBrowserUrl(tab.url)) return unavailablePage(tab.url, tab.title, "internal_page");
  const maxChars = options.full ? FULL_TEXT_CHARS : AI_CONTEXT_CHARS;
  try {
    if (tab.loading) await manager.waitForLoad(tabId, 10_000);
    const raw = await manager.runInPage(tabId, extractPageScript,
      { maxChars: FULL_TEXT_CHARS, maxLinks: 200, maxTables: 10, maxRows: 60 }, readabilityPrelude());
    const current = manager.getTab(tabId) ?? tab;
    return buildPageContent(raw, current.url, current.title, maxChars);
  } catch (error) {
    return unavailablePage(tab.url, tab.title, error instanceof Error ? error.message.slice(0, 60) : "extraction_failed");
  }
}

export async function getSelection(manager: BrowserManager, tabId: string): Promise<string> {
  try {
    return cleanText(await manager.runInPage(tabId, selectionScript, { maxChars: 50_000 }));
  } catch {
    return "";
  }
}
