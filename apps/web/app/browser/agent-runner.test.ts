import { describe, expect, it } from "vitest";
import { matchShortcut } from "../../../desktop/src/browser/browser-shortcuts";
import { agentRequestSchema } from "@/lib/browser/context";
import { askRoxane, parseSse, runTurn, toPageContext, type JournalEntry, type RunnerDeps } from "./agent-runner";
import { shouldForwardKey, type DesktopAgentOutcome, type DesktopPageContent } from "./browser-api";

const PAGE: DesktopPageContent = {
  status: "ok", url: "https://a.test/article", title: "Marées", description: "", siteName: "", author: "", lang: "fr", publishedAt: null,
  canonicalUrl: null, text: "Les marées sont causées par la Lune.", truncated: false, totalChars: 36, wordCount: 7, method: "readability",
  headings: [{ level: 1, text: "Marées" }], links: [], tables: [],
};

type Event = [string, Record<string, unknown>];
const sse = (events: Event[]) => new Response(new ReadableStream({
  start(controller) {
    for (const [event, data] of events) controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    controller.close();
  },
}), { status: 200 });
const answer = (text: string): Event[] => [["meta", { step: 0 }], ["delta", { text }], ["done", { text, continuation: "jeton" }]];
const toolStep = (name: string, args: object, text = ""): Event[] =>
  [...(text ? [["delta", { text }] as Event] : []), ["tool_calls", { calls: [{ id: `c-${name}`, name, arguments: JSON.stringify(args) }] }], ["done", { continuation: "jeton" }]];

function harness(script: (Event[] | (() => Promise<Response>))[], outcomes: Record<string, DesktopAgentOutcome> = {}, confirm: (entry: JournalEntry) => Promise<boolean> = async () => true) {
  const controller = new AbortController();
  const log: string[] = [];
  const requests: unknown[] = [];
  const journal: JournalEntry[] = [];
  const texts: string[] = [];
  const deps: RunnerDeps = {
    api: {
      agentStart: async ({ text, reset }) => { log.push(`start:${text}:${reset ? "reset" : "keep"}`); return { mission: 1, mode: "assistance" }; },
      agentCall: async ({ name }) => { log.push(`call:${name}`); return outcomes[name] ?? { status: "ok", tool: name, summary: name, result: { ok: true } }; },
      agentResolve: async ({ approve }) => {
        log.push(`resolve:${approve}`);
        return approve ? { status: "ok", tool: "click_element", summary: "Cliquer", result: { done: true } }
          : { status: "denied", tool: "click_element", summary: "Cliquer", error: "user_denied", message: "Refusé" };
      },
      agentAbort: async () => { log.push("abort"); return true; },
      extractPage: async () => PAGE,
      getSelection: async () => "",
      getState: async () => ({ activeTabId: "t1", tabs: [], fullscreen: false, downloads: [] }),
    },
    fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      const next = script.shift();
      if (!next) return new Response(JSON.stringify({ error: "script_vide" }), { status: 500 });
      if (typeof next === "function") return next();
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return sse(next);
    }) as typeof fetch,
    signal: controller.signal,
    onText: (text) => texts.push(text),
    onJournal: (entry) => { journal.push({ ...entry }); },
    confirm,
    save: async (request) => { log.push(`save:${request.mode}`); return { ok: true, message: "Ajouté au Notebook." }; },
  };
  return { deps, controller, log, requests, journal, texts };
}

describe("boucle de l'agent", () => {
  it("question simple : le contexte de la page active est joint, la réponse arrive en flux", async () => {
    const h = harness([answer("La Lune. Sources : https://a.test/article")]);
    const result = await runTurn(h.deps, [], "Résume cette page", { reset: true });
    expect(result.error).toBeUndefined();
    expect(result.transcript.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(h.log).toEqual(["start:Résume cette page:reset"]);
    const body = agentRequestSchema.parse(h.requests[0]); // la requête émise respecte le schéma strict du serveur
    expect(body.messages[0]).toMatchObject({ role: "user", text: "Résume cette page", page: { url: "https://a.test/article", status: "ok" } });
    expect(JSON.stringify(h.requests[0])).not.toMatch(/<html|<body/i);
    expect(h.texts.at(-1)).toContain("La Lune.");
  });

  it("mission à étapes : chaque appel passe par Main, le résultat revient au modèle", async () => {
    const h = harness([toolStep("browser_get_page_content", {}, "Je lis la page."), toolStep("browser_extract_links", {}), answer("Voici les liens.")]);
    const result = await runTurn(h.deps, [], "Liste les liens");
    expect(h.log).toEqual(["start:Liste les liens:keep", "call:browser_get_page_content", "call:browser_extract_links"]);
    expect(result.transcript.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant"]);
    expect(h.journal.filter((entry) => entry.status === "done")).toHaveLength(2);
    expect((h.requests[1] as { continuation: string }).continuation).toBe("jeton");
    for (const request of h.requests) expect(agentRequestSchema.safeParse(request).success).toBe(true);
  });

  it("confirmation : l'action attend la décision ; un refus est transmis au modèle, sans exécution", async () => {
    const pending: DesktopAgentOutcome = { status: "confirmation_required", tool: "click_element", summary: "Cliquer sur « Acheter »", actionId: "a1", reason: "action engageante" };
    const seen: JournalEntry[] = [];
    const h = harness([toolStep("browser_click_element", { element: "e1" }), answer("D'accord, je n'achète pas.")], { browser_click_element: pending },
      async (entry) => { seen.push(entry); return false; });
    const result = await runTurn(h.deps, [], "Achète-le");
    expect(seen[0]).toMatchObject({ status: "pending", detail: "action engageante" });
    expect(h.log).toEqual(["start:Achète-le:keep", "call:browser_click_element", "resolve:false"]);
    const tool = result.transcript.find((message) => message.role === "tool");
    expect(tool && "result" in tool && JSON.parse(tool.result)).toMatchObject({ status: "denied", error: "user_denied" });
    expect(h.journal.at(-1)?.status).toBe("denied");

    const ok = harness([toolStep("browser_click_element", { element: "e1" }), answer("Fait.")], { browser_click_element: pending }, async () => true);
    await runTurn(ok.deps, [], "Clique");
    expect(ok.log).toContain("resolve:true");
    expect(ok.journal.at(-1)?.status).toBe("done");
  });

  it("interruption pendant une confirmation : rien n'est approuvé, Main est prévenu, le tour s'arrête", async () => {
    const pending: DesktopAgentOutcome = { status: "confirmation_required", tool: "open_url", summary: "Ouvrir https://x.test/", actionId: "a1", reason: "validation" };
    let release: (approved: boolean) => void = () => undefined;
    const h = harness([toolStep("browser_open_url", { url: "https://x.test/" }), answer("ne doit pas être demandé")], { browser_open_url: pending },
      () => new Promise<boolean>((resolve) => { release = resolve; }));
    const turn = runTurn(h.deps, [], "Ouvre x.test");
    await new Promise((resolve) => setTimeout(resolve, 20));
    h.controller.abort();
    release(true); // même une approbation tardive n'est pas transmise après l'arrêt
    const result = await turn;
    expect(result.error).toBe("aborted");
    expect(h.log).toEqual(["start:Ouvre x.test:keep", "call:browser_open_url", "abort"]);
    expect(h.requests).toHaveLength(1);
  });

  it("interruption pendant la génération : le texte partiel est conservé", async () => {
    const h = harness([() => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"Début de réponse"}\n\n'));
        setTimeout(() => { h.controller.abort(); controller.error(new DOMException("aborted", "AbortError")); }, 10);
      },
    }), { status: 200 }))]);
    const result = await runTurn(h.deps, [], "Résume");
    expect(result.error).toBe("aborted");
    expect(result.transcript.at(-1)).toEqual({ role: "assistant", text: "Début de réponse" });
    expect(h.log).toContain("abort");
  });

  it("ajout au Notebook approuvé : l'enregistrement est fait par l'application, son résultat réel est rapporté", async () => {
    const h = harness([toolStep("browser_save_to_notebook", { mode: "text" }), answer("C'est enregistré.")], {
      browser_save_to_notebook: { status: "ok", tool: "save_to_notebook", summary: "Ajouter", result: { status: "approved_by_user" }, save: { mode: "text", url: "https://a.test/article", title: "Marées", favicon: null, text: "…" } },
    });
    const result = await runTurn(h.deps, [], "Garde cette page");
    expect(h.log).toContain("save:text");
    const tool = result.transcript.find((message) => message.role === "tool");
    expect(tool && "result" in tool && JSON.parse(tool.result)).toEqual({ saved: true, message: "Ajouté au Notebook." });
  });

  it("erreurs du serveur remontées avec leur code, sans réponse inventée", async () => {
    const h = harness([() => Promise.resolve(new Response(JSON.stringify({ error: "quota_daily_exceeded" }), { status: 429 }))]);
    const result = await runTurn(h.deps, [], "Résume");
    expect(result.error).toBe("quota_daily_exceeded");
    expect(result.transcript.map((message) => message.role)).toEqual(["user"]);
    const upstream = harness([[["error", { code: "upstream_error" }]]]);
    expect((await runTurn(upstream.deps, [], "Résume")).error).toBe("upstream_error");
  });

  it("garde-fou : nombre d'étapes borné même si le modèle boucle", async () => {
    const h = harness(Array.from({ length: 40 }, () => toolStep("browser_scroll_page", { direction: "down" })));
    const result = await runTurn(h.deps, [], "Défile");
    expect(result.error).toBe("step_limit");
    expect(h.requests.length).toBeLessThanOrEqual(14);
  });

  it("Roxane : une seule requête, sans outils, sans toucher à la conversation de Leanna", async () => {
    const h = harness([answer("Attention, le Soleil compte aussi.")]);
    const transcript = (await runTurn(harness([answer("La Lune.")]).deps, [], "Résume")).transcript;
    const result = await askRoxane(h.deps, transcript, () => undefined);
    expect(result.text).toBe("Attention, le Soleil compte aussi.");
    const body = agentRequestSchema.parse(h.requests[0]);
    expect(body.persona).toBe("roxane");
    expect(body.messages.at(-1)?.role).toBe("user");
    expect(h.log).toEqual([]);
  });
});

describe("utilitaires", () => {
  it("le contexte de page est borné avant envoi", () => {
    const context = toPageContext({ ...PAGE, text: "x".repeat(80_000), title: "t".repeat(900) });
    expect(context.text.length).toBe(30_000);
    expect(context.truncated).toBe(true);
    expect(context.title.length).toBe(300);
    expect(context.headings).toEqual(["# Marées"]);
  });

  it("parseSse reconstitue les événements coupés entre deux paquets", async () => {
    const chunks = ['event: delta\ndata: {"te', 'xt":"a"}\n\nevent: done\ndata: {"x":1}\n\n'];
    const response = new Response(new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)); c.close(); } }));
    const events = [];
    for await (const event of parseSse(response)) events.push(event);
    expect(events).toEqual([{ event: "delta", data: { text: "a" } }, { event: "done", data: { x: 1 } }]);
  });

  it("le filtre clavier de l'interface est strictement équivalent à la table de raccourcis de Main", () => {
    const keys = ["a", "t", "w", "r", "l", "d", "h", "j", "k", "c", "v", "x", "z", "+", "=", "-", "0", "1", "Tab", "PageUp", "PageDown", "ArrowLeft", "ArrowRight",
      "F5", "F6", "F11", "F12", "Enter", "Escape", "T", "W", "R"];
    for (const key of keys) for (const ctrlKey of [false, true]) for (const metaKey of [false, true]) for (const shiftKey of [false, true]) for (const altKey of [false, true]) {
      const expected = matchShortcut({ key, control: ctrlKey, meta: metaKey, shift: shiftKey, alt: altKey }) !== null;
      expect(shouldForwardKey({ key, ctrlKey, metaKey, shiftKey, altKey }), JSON.stringify({ key, ctrlKey, metaKey, shiftKey, altKey })).toBe(expected);
    }
  });
});
