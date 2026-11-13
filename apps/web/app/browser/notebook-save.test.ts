import { describe, expect, it } from "vitest";
import { browserExternalRef, sourcesCreateSchema } from "@/lib/validation";
import type { DesktopSaveRequest } from "./browser-api";
import { saveToNotebook, sourceText } from "./notebook-save";

const NOTEBOOK = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-13T08:30:00.000Z");
const base: DesktopSaveRequest = { mode: "text", url: "https://a.test/article", title: "Marées", favicon: "https://a.test/favicon.ico", text: "Les marées sont causées par la Lune." };

function recorder(status: Record<string, { status: number; error?: string }> = {}) {
  const calls: { url: string; body: Record<string, unknown>; idempotency: string | null }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    calls.push({ url: path, body: JSON.parse(String(init?.body)), idempotency: new Headers(init?.headers).get("idempotency-key") });
    const kind = path.endsWith("/notes") ? "notes" : "sources";
    const outcome = status[kind] ?? { status: 202 };
    return new Response(JSON.stringify(outcome.error ? { error: outcome.error } : {}), { status: outcome.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("ajout au Notebook depuis le navigateur", () => {
  it("lien seul : source « url » avec titre, favicon et date de consultation", async () => {
    const { calls, fetchImpl } = recorder();
    const result = await saveToNotebook(fetchImpl, NOTEBOOK, { ...base, mode: "link" }, NOW);
    expect(result).toEqual({ ok: true, message: "Lien ajouté au Notebook." });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`/api/v1/notebooks/${NOTEBOOK}/sources`);
    expect(calls[0].idempotency).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0].body).toEqual({ items: [{ type: "url", url: "https://a.test/article",
      browser: { title: "Marées", consultedAt: "2026-11-13T08:30:00.000Z", mode: "link", faviconUrl: "https://a.test/favicon.ico" } }] });
    expect(sourcesCreateSchema.safeParse(calls[0].body).success, "accepté par le schéma strict de la route existante").toBe(true);
  });

  it("contenu : source « text » qui garde l'URL d'origine, dans les métadonnées et dans le texte", async () => {
    const { calls, fetchImpl } = recorder();
    const result = await saveToNotebook(fetchImpl, NOTEBOOK, base, NOW);
    expect(result.ok).toBe(true);
    const item = (calls[0].body.items as Record<string, unknown>[])[0];
    expect(item).toMatchObject({ type: "text", title: "Marées", browser: { originUrl: "https://a.test/article", mode: "text", consultedAt: NOW.toISOString() } });
    expect(item.text).toBe("Source : https://a.test/article\nPage consultée le 2026-11-13\n\nLes marées sont causées par la Lune.");
    expect(sourcesCreateSchema.safeParse(calls[0].body).success).toBe(true);
  });

  it("contenu + synthèse : la source puis une note de synthèse citant l'adresse", async () => {
    const { calls, fetchImpl } = recorder({ notes: { status: 201 } });
    const result = await saveToNotebook(fetchImpl, NOTEBOOK, { ...base, mode: "summary", summary: "La Lune provoque les marées." }, NOW);
    expect(result).toEqual({ ok: true, message: "Contenu et synthèse ajoutés au Notebook." });
    expect(calls.map((call) => call.url.split("/").pop())).toEqual(["sources", "notes"]);
    expect(calls[1].body).toEqual({ title: "Synthèse — Marées", text: "La Lune provoque les marées.\n\nSource : https://a.test/article" });
  });

  it("sélection : seul l'extrait est enregistré, signalé comme tel", async () => {
    const { calls, fetchImpl } = recorder();
    await saveToNotebook(fetchImpl, NOTEBOOK, { ...base, mode: "selection", text: "Le rôle de la Lune" }, NOW);
    const item = (calls[0].body.items as Record<string, unknown>[])[0];
    expect(item.text).toBe(sourceText({ ...base, mode: "selection", text: "Le rôle de la Lune" }, NOW.toISOString()));
    expect(item.text).toContain("(extrait sélectionné)");
    expect((item.browser as { mode: string }).mode).toBe("selection");
  });

  it("échecs dits clairement : aucun succès annoncé à tort", async () => {
    expect(await saveToNotebook(recorder().fetchImpl, null, base)).toEqual({ ok: false, message: "Choisissez d’abord un notebook de destination." });
    expect((await saveToNotebook(recorder().fetchImpl, NOTEBOOK, { ...base, text: "  " })).ok).toBe(false);
    expect(await saveToNotebook(recorder({ sources: { status: 403, error: "forbidden" } }).fetchImpl, NOTEBOOK, base))
      .toEqual({ ok: false, message: "Vous n’avez pas le droit de modifier ce notebook." });
    expect((await saveToNotebook(recorder({ sources: { status: 409, error: "max_sources" } }).fetchImpl, NOTEBOOK, base)).message).toMatch(/nombre maximal/);
    const partial = await saveToNotebook(recorder({ notes: { status: 500 } }).fetchImpl, NOTEBOOK, { ...base, mode: "summary", summary: "S" });
    expect(partial).toEqual({ ok: true, message: "Contenu ajouté au Notebook, mais la synthèse n’a pas pu être enregistrée." });
    const failing = (async () => { throw new Error("réseau"); }) as unknown as typeof fetch;
    expect((await saveToNotebook(failing, NOTEBOOK, base)).ok).toBe(false);
  });

  it("une favicon non http(s) n'est pas transmise", async () => {
    const { calls, fetchImpl } = recorder();
    await saveToNotebook(fetchImpl, NOTEBOOK, { ...base, mode: "link", favicon: "data:image/png;base64,AAAA" }, NOW);
    expect(JSON.stringify(calls[0].body)).not.toContain("faviconUrl");
  });
});

describe("schéma et métadonnées côté serveur", () => {
  it("la provenance est stricte : champs inconnus et adresses non http(s) refusés", () => {
    const item = (browser: unknown) => ({ items: [{ type: "url", url: "https://a.test/", browser }] });
    expect(sourcesCreateSchema.safeParse(item({ title: "T" })).success).toBe(true);
    expect(sourcesCreateSchema.safeParse({ items: [{ type: "url", url: "https://a.test/" }] }).success, "les appels existants restent valides").toBe(true);
    for (const bad of [{ faviconUrl: "javascript:alert(1)" }, { originUrl: "file:///etc/passwd" }, { consultedAt: "hier" }, { mode: "tout" }, { html: "<b>" }]) {
      expect(sourcesCreateSchema.safeParse(item(bad)).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("external_ref.browser : date d'ajout, date de consultation, favicon, titre, mode", () => {
    expect(browserExternalRef({ title: "Marées", faviconUrl: "https://a.test/f.ico", consultedAt: "2026-11-13T08:30:00.000Z", mode: "text" }, NOW)).toEqual({
      browser: { added_at: "2026-11-13T08:30:00.000Z", consulted_at: "2026-11-13T08:30:00.000Z", favicon_url: "https://a.test/f.ico", title: "Marées", mode: "text" },
    });
    expect(browserExternalRef({}, NOW)).toEqual({ browser: { added_at: NOW.toISOString() } });
  });
});
