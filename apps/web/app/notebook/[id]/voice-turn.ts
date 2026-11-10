export type RetrievedVoicePassage = {
  sourceId: string;
  title: string;
  page: number | null;
  excerpt: string;
  charStart: number;
  charEnd: number;
  timeStartMs: number | null;
};
export type NumberedVoicePassage = RetrievedVoicePassage & { number: number };

/** Roxane reste silencieuse pendant les deux premiers échanges du studio vocal. */
export function shouldInviteRoxane(turnNumber: number): boolean {
  return Number.isInteger(turnNumber) && turnNumber > 2;
}

/** Keeps citations scoped to one Gemini Live turn and deduplicates exact source ranges. */
export class VoiceTurnCitationStore {
  private readonly passages = new Map<string, NumberedVoicePassage>();

  add(retrieved: RetrievedVoicePassage[]): NumberedVoicePassage[] {
    return retrieved.map((passage) => {
      const key = `${passage.sourceId}:${passage.charStart}:${passage.charEnd}`;
      const existing = this.passages.get(key);
      if (existing) return existing;
      const numbered = { ...passage, number: this.passages.size + 1 };
      this.passages.set(key, numbered);
      return numbered;
    });
  }

  snapshot(): NumberedVoicePassage[] {
    return [...this.passages.values()];
  }

  sourceIds(): string[] {
    return [...new Set([...this.passages.values()].map((passage) => passage.sourceId))];
  }

  clear(): void {
    this.passages.clear();
  }
}

/** Tracks concurrent RAG calls so turnComplete cannot snapshot an incomplete citation set. */
export class PendingVoiceSearches {
  private pending = 0;
  private readonly idleWaiters = new Set<() => void>();

  get count(): number {
    return this.pending;
  }

  track<T>(search: Promise<T>): Promise<T> {
    this.pending += 1;
    return search.finally(() => {
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0) {
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    });
  }

  waitForIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }
}
