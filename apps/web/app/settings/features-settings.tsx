"use client";
import * as React from "react";
import { Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { OPTIONAL_FEATURES, type OptionalFeature } from "@/lib/validation";
import { SettingsRow, SettingsSection } from "./settings-ui";

const FEATURES: Record<OptionalFeature, { label: string; description: string }> = {
  deep_research: { label: "Recherche approfondie", description: "Agent de recherche web autonome, rapport cité dans le Studio et suivi flottant des recherches." },
  knowledge_graph: { label: "Graphe de connaissances", description: "Extraction des entités et relations de vos sources (consomme des crédits IA à chaque import)." },
  contradictions: { label: "Contradictions", description: "Comparaison des affirmations entre vos sources. S’appuie sur le graphe de connaissances." },
  prompt_suggestions: { label: "Suggestions de consignes", description: "Bouton « Suggérer avec l’IA » sous les consignes du Studio : 3 idées adaptées à vos sources, à la demande." },
};

/** Activer / désactiver les fonctionnalités optionnelles : masquées de l'interface et plus déclenchées une fois désactivées. */
export function FeaturesSettings({ initial }: { initial: OptionalFeature[] }) {
  const [disabled, setDisabled] = React.useState<Set<OptionalFeature>>(new Set(initial));
  const [saving, setSaving] = React.useState<OptionalFeature | null>(null);

  async function toggle(feature: OptionalFeature, enabled: boolean) {
    const next = new Set(disabled);
    if (enabled) next.delete(feature); else next.add(feature);
    setSaving(feature);
    try {
      const r = await fetch("/api/v1/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ disabled_features: [...next] }) });
      if (!r.ok) throw new Error();
      setDisabled(next);
      toast({ title: `${FEATURES[feature].label} ${enabled ? "activée" : "désactivée"}`, tone: "success" });
    } catch {
      toast({ title: "Réglage non enregistré", description: "Réessayez dans un instant.", tone: "error" });
    } finally { setSaving(null); }
  }

  return (
    <SettingsSection title="Fonctionnalités" description="Une fonctionnalité désactivée disparaît de vos notebooks et n’est plus lancée pour vous. Les données déjà produites sont conservées et réapparaissent si vous la réactivez.">
      {OPTIONAL_FEATURES.map((f) => (
        <SettingsRow key={f} label={FEATURES[f].label} description={FEATURES[f].description} htmlFor={`feature-${f}`}>
          <div className="flex items-center gap-3 md:justify-end">
            <span className="text-sm text-text-muted">{disabled.has(f) ? "Désactivée" : "Activée"}</span>
            <Switch id={`feature-${f}`} checked={!disabled.has(f)} disabled={saving !== null} onCheckedChange={(v) => void toggle(f, v)} />
          </div>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
