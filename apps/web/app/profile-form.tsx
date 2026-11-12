"use client";
import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SettingsFooter, SettingsRow, SettingsSection } from "./settings/settings-ui";

type Theme = "light" | "dark" | "system";
type Profile = { display_name: string | null; output_language: string; theme: Theme; web_notifications: boolean };
const LANG_LABELS: Record<string, string> = { fr: "Français", en: "English", es: "Español", de: "Deutsch", it: "Italiano", pt: "Português", nl: "Nederlands" };
const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "Système", icon: <Monitor /> },
  { value: "light", label: "Clair", icon: <Sun /> },
  { value: "dark", label: "Sombre", icon: <Moon /> },
];

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Préférences du compte (A01, J01, J02) : enregistrées via PATCH /api/v1/me. */
export function ProfileForm({ initial, showPreferences = false }: { initial: Profile; showPreferences?: boolean }) {
  const [saved, setSaved] = React.useState(initial);
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { applyTheme(initial.theme); }, [initial.theme]);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

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
      setSaved(values);
      toast({ title: "Préférences enregistrées", tone: "success" });
    } catch {
      toast({ title: "Enregistrement impossible", description: "Vérifiez votre connexion puis réessayez.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const select = "h-9 w-full rounded-md border border-border-input bg-surface-raised px-3 text-sm";
  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsSection title="Profil" description="Informations visibles par les personnes avec qui vous collaborez.">
        <SettingsRow label="Nom affiché" htmlFor="display_name" description="Visible par les personnes avec qui vous partagez un notebook.">
          <div className="grid gap-1.5">
            <Input
              id="display_name"
              value={values.display_name ?? ""}
              maxLength={120}
              placeholder="Votre nom"
              aria-invalid={errors.display_name ? true : undefined}
              aria-describedby={errors.display_name ? "display_name-error" : undefined}
              onChange={(e) => setValues({ ...values, display_name: e.target.value })}
            />
            {errors.display_name && <p id="display_name-error" role="alert" className="text-xs font-medium text-danger">{errors.display_name}</p>}
          </div>
        </SettingsRow>
        <SettingsRow label="Langue des réponses" htmlFor="output_language" description="Langue utilisée par l’IA pour le chat et les contenus générés.">
          <select id="output_language" className={select} value={values.output_language} onChange={(e) => setValues({ ...values, output_language: e.target.value })}>
            {Object.entries(LANG_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {errors.output_language && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{errors.output_language}</p>}
        </SettingsRow>
        <SettingsFooter>
          <p className="text-xs text-text-subtle" aria-live="polite">{dirty ? "Modifications non enregistrées" : "Tout est à jour"}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setValues(saved); applyTheme(saved.theme); setErrors({}); }}>Annuler</Button>
            <Button type="submit" loading={saving} disabled={!dirty}>Enregistrer</Button>
          </div>
        </SettingsFooter>
      </SettingsSection>

      {showPreferences && (<>
      <SettingsSection title="Apparence" description="Choisissez le thème de l’interface." className="mt-6">
        <SettingsRow label="Thème" description="« Système » suit le réglage de votre appareil.">
          <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const checked = values.theme === t.value;
              return (
                <label
                  key={t.value}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                    checked ? "border-accent bg-accent-soft text-on-accent-soft" : "bg-surface-raised text-text-muted hover:border-border-strong hover:text-text",
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={t.value}
                    checked={checked}
                    onChange={() => { setValues({ ...values, theme: t.value }); applyTheme(t.value); }}
                    className="sr-only"
                  />
                  <span aria-hidden className="[&_svg]:size-5">{t.icon}</span>
                  {t.label}
                </label>
              );
            })}
          </div>
          {errors.theme && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{errors.theme}</p>}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Notifications" description="Restez informé·e sans rester devant l’écran." className="mt-6">
        <SettingsRow label="Fin de génération" description="Notification web quand un rapport, un quiz ou une fiche est prêt.">
          <div className="md:flex md:justify-end">
            <Switch aria-label="Notification de fin de génération" checked={values.web_notifications} onCheckedChange={(v) => setValues({ ...values, web_notifications: v })} />
          </div>
        </SettingsRow>
      </SettingsSection>
      </>)}
    </form>
  );
}
