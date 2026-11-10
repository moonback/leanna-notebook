"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { DEFAULT_VOICE_SYSTEM_PROMPT } from "@/lib/voice-prompt";

const MAX_PROMPT_LENGTH = 20_000;

export function VoicePromptForm({ initialPrompt }: { initialPrompt: string | null }) {
  const [prompt, setPrompt] = React.useState(initialPrompt?.trim() || DEFAULT_VOICE_SYSTEM_PROMPT);
  const [saving, setSaving] = React.useState(false);
  const [savedPrompt, setSavedPrompt] = React.useState(initialPrompt?.trim() || DEFAULT_VOICE_SYSTEM_PROMPT);
  const dirty = prompt !== savedPrompt;

  async function persist(value: string | null) {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voice_system_prompt: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 422 && payload.fields?.voice_system_prompt) {
          throw new Error(payload.fields.voice_system_prompt);
        }
        throw new Error("Enregistrement impossible. Réessayez.");
      }
      const next = value?.trim() || DEFAULT_VOICE_SYSTEM_PROMPT;
      setPrompt(next);
      setSavedPrompt(next);
      toast({
        title: value === null ? "Prompt par défaut restauré" : "Prompt vocal enregistré",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Enregistrement impossible",
        description: error instanceof Error ? error.message : "Vérifiez votre connexion puis réessayez.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="voice-system-prompt" className="text-sm font-medium">Prompt système</label>
        <p id="voice-prompt-help" className="text-sm text-text-muted">
          Ces instructions définissent le comportement de Leanna pendant les conversations vocales Gemini Live.
          Elles sont appliquées à chaque nouvelle session.
        </p>
      </div>
      <textarea
        id="voice-system-prompt"
        aria-describedby="voice-prompt-help voice-prompt-count"
        value={prompt}
        maxLength={MAX_PROMPT_LENGTH}
        onChange={(event) => setPrompt(event.target.value)}
        spellCheck
        rows={16}
        className="min-h-72 w-full resize-y rounded-lg border border-border-input bg-surface-raised p-3 font-mono text-sm leading-6 text-text outline-none transition focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="voice-prompt-count" className="text-xs text-text-subtle tabular-nums">
          {prompt.length.toLocaleString("fr-FR")} / {MAX_PROMPT_LENGTH.toLocaleString("fr-FR")} caractères
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={saving || !dirty} onClick={() => void persist(null)}>
            Restaurer le prompt par défaut
          </Button>
          <Button type="button" loading={saving} disabled={!dirty || prompt.trim().length === 0} onClick={() => void persist(prompt)}>
            Enregistrer
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-subtle">
        Le prompt personnalisé est privé à votre compte. Les changements prennent effet à la prochaine connexion vocale.
      </p>
    </div>
  );
}
