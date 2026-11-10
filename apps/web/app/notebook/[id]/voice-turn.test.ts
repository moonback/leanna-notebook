import { describe, expect, it } from "vitest";
import { PendingVoiceSearches, VoiceTurnCitationStore, type RetrievedVoicePassage } from "./voice-turn";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const passage = (sourceId: string, charStart: number, charEnd: number, excerpt: string): RetrievedVoicePassage => ({
  sourceId,
  title: `Document ${sourceId}`,
  page: 1,
  excerpt,
  charStart,
  charEnd,
  timeStartMs: null
});

describe("VoiceTurnCitationStore", () => {
  it("regroupe les résultats de plusieurs recherches et déduplique uniquement les mêmes passages", () => {
    const store = new VoiceTurnCitationStore();

    const firstSearch = store.add([
      passage("source-a", 10, 20, "Premier extrait"),
      passage("source-a", 30, 40, "Deuxième extrait")
    ]);
    const secondSearch = store.add([
      passage("source-a", 10, 20, "Premier extrait retrouvé"),
      passage("source-b", 5, 15, "Extrait d'un autre document")
    ]);

    expect(firstSearch.map((item) => item.number)).toEqual([1, 2]);
    expect(secondSearch.map((item) => item.number)).toEqual([1, 3]);
    expect(store.snapshot().map((item) => [item.sourceId, item.charStart, item.charEnd])).toEqual([
      ["source-a", 10, 20],
      ["source-a", 30, 40],
      ["source-b", 5, 15]
    ]);
    expect(store.sourceIds()).toEqual(["source-a", "source-b"]);
  });

  it("isole les citations entre deux tours vocaux", () => {
    const store = new VoiceTurnCitationStore();
    store.add([passage("source-a", 0, 8, "Réponse du premier tour")]);

    const firstTurn = store.snapshot();
    store.clear();
    store.add([passage("source-b", 100, 120, "Réponse du deuxième tour")]);

    expect(firstTurn.map((item) => item.sourceId)).toEqual(["source-a"]);
    expect(store.snapshot().map((item) => item.sourceId)).toEqual(["source-b"]);
    expect(store.snapshot()[0].number).toBe(1);
  });
});

describe("PendingVoiceSearches", () => {
  it("attend toutes les recherches simultanées avant de considérer le tour terminé", async () => {
    const pending = new PendingVoiceSearches();
    const searchA = deferred<string>();
    const searchB = deferred<string>();
    const taskA = pending.track(searchA.promise);
    const taskB = pending.track(searchB.promise);
    let idle = false;

    const wait = pending.waitForIdle().then(() => { idle = true; });
    expect(pending.count).toBe(2);

    searchA.resolve("résultat A");
    await taskA;
    await Promise.resolve();
    expect(idle).toBe(false);
    expect(pending.count).toBe(1);

    searchB.resolve("résultat B");
    await taskB;
    await wait;
    expect(idle).toBe(true);
    expect(pending.count).toBe(0);
  });

  it("libère l'attente même si une recherche échoue", async () => {
    const pending = new PendingVoiceSearches();
    const failed = pending.track(Promise.reject(new Error("RAG indisponible")));

    await expect(failed).rejects.toThrow("RAG indisponible");
    await expect(pending.waitForIdle()).resolves.toBeUndefined();
    expect(pending.count).toBe(0);
  });
});
