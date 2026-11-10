"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";

type Profile = { display_name: string | null; output_language: string; theme: "light" | "dark" | "system"; web_notifications: boolean };
const LANG_LABELS: Record<string, string> = { fr: "Français", en: "English", es: "Español", de: "Deutsch", it: "Italiano", pt: "Português", nl: "Nederlands" };

function applyTheme(theme: Profile["theme"]) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Préférences du compte (A01, J01, J02) : enregistrées via PATCH /api/v1/me. */
export function ProfileForm({ initial }: { initial: Profile }) {
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { applyTheme(values.theme); }, [values.theme]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, display_name: values.display_name?.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 422) return setErrors(json.fields ?? {});
      if (!res.ok) throw new Error(json.error);
      applyTheme(values.theme);
      toast({ title: "Préférences enregistrées", tone: "success" });
    } catch {
      toast({ title: "Enregistrement impossible", description: "Vérifiez votre connexion puis réessayez.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const select = "h-9 w-full rounded-md border border-border-input bg-surface-raised px-3 text-sm";
  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <Field id="display_name" label="Nom affiché" hint="Visible par les personnes avec qui vous partagez un notebook." error={errors.display_name}>
        <Input value={values.display_name ?? ""} maxLength={120} onChange={(e) => setValues({ ...values, display_name: e.target.value })} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="output_language" label="Langue des réponses" error={errors.output_language}>
          <select className={select} value={values.output_language} onChange={(e) => setValues({ ...values, output_language: e.target.value })}>
            {Object.entries(LANG_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field id="theme" label="Apparence" hint="Le changement est prévisualisé immédiatement. Enregistrez pour le conserver sur vos appareils." error={errors.theme}>
          <select className={select} value={values.theme} onChange={(e) => setValues({ ...values, theme: e.target.value as Profile["theme"] })}>
            <option value="system">Comme l’appareil</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={values.web_notifications} onCheckedChange={(v) => setValues({ ...values, web_notifications: v })} />
        Recevoir une notification quand une génération est terminée
      </label>
      <div><Button type="submit" loading={saving}>Enregistrer</Button></div>
    </form>
  );
}
