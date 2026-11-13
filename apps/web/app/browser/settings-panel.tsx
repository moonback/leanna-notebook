"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { DesktopBrowserApi, DesktopBrowserSettings, DesktopPermissionDecision } from "./browser-api";

type Props = { api: DesktopBrowserApi; settings: DesktopBrowserSettings; onSettings: (settings: DesktopBrowserSettings) => void };

const ENGINES = [["google", "Google"], ["duckduckgo", "DuckDuckGo"], ["bing", "Bing"], ["brave", "Brave Search"], ["qwant", "Qwant"]] as const;
const PERMISSION_LABELS: Record<string, string> = { media: "Caméra et microphone", geolocation: "Position", notifications: "Notifications", "clipboard-read": "Presse-papiers" };
const control = "h-8 w-full rounded-md border border-border-input bg-surface-raised px-2 text-sm outline-none focus-visible:border-focus";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-text">{label}</span>
      {children}
      {hint && <span className="text-xs leading-4 text-text-muted">{hint}</span>}
    </label>
  );
}

function Toggle({ label, hint, checked, onChange, name }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; name: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={checked} data-setting={name} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="font-medium text-text">{label}</span>{hint && <span className="block text-xs leading-4 text-text-muted">{hint}</span>}</span>
    </label>
  );
}

/** Réglages du navigateur, enregistrés localement par l'application desktop. */
export function SettingsPanel({ api, settings, onSettings }: Props) {
  const [homepage, setHomepage] = React.useState(settings.homepage);
  const [permissions, setPermissions] = React.useState<Record<string, Record<string, DesktopPermissionDecision>>>({});
  const [notice, setNotice] = React.useState("");
  const update = (patch: Partial<DesktopBrowserSettings>) => void api.updateSettings(patch).then(onSettings).catch(() => setNotice("Réglage non enregistré."));
  const loadPermissions = React.useCallback(() => { void api.getPermissions().then(setPermissions).catch(() => undefined); }, [api]);
  React.useEffect(loadPermissions, [loadPermissions]);

  async function saveHomepage(event: React.FormEvent) {
    event.preventDefault();
    const next = await api.updateSettings({ homepage: homepage.trim() });
    onSettings(next);
    // Une adresse refusée (autre que http/https) laisse l'ancienne valeur : on le dit.
    setNotice(next.homepage === homepage.trim() ? "Page d’accueil enregistrée." : "Adresse refusée : saisissez une adresse complète en http(s).");
    setHomepage(next.homepage);
  }

  const sites = Object.entries(permissions);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" data-settings-panel>
      <h2 className="text-sm font-semibold">Réglages du navigateur</h2>
      <div className="mt-3 grid gap-4">
        <Row label="Moteur de recherche">
          <select className={control} value={settings.searchEngine} data-setting="searchEngine" onChange={(event) => update({ searchEngine: event.target.value as DesktopBrowserSettings["searchEngine"] })}>
            {ENGINES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Row>
        <form onSubmit={saveHomepage}>
          <Row label="Page d’accueil" hint="Vide : page d’accueil du moteur de recherche.">
            <span className="flex gap-1">
              <input className={control} value={homepage} data-setting="homepage" placeholder="https://…" maxLength={2048} onChange={(event) => setHomepage(event.target.value)} />
              <Button type="submit" size="sm" variant="secondary">OK</Button>
            </span>
          </Row>
        </form>
        <Toggle name="restoreTabs" label="Restaurer les onglets au démarrage" checked={settings.restoreTabs} onChange={(value) => update({ restoreTabs: value })} />
        <Toggle name="popups" label="Ouvrir les pop-ups dans un onglet" hint="Sinon elles sont bloquées. Aucune fenêtre séparée n’est jamais créée."
          checked={settings.popups === "tab"} onChange={(value) => update({ popups: value ? "tab" : "block" })} />
        <Toggle name="cookies" label="Effacer les cookies et données de sites à chaque démarrage" checked={settings.cookies === "clear-on-exit"}
          onChange={(value) => update({ cookies: value ? "clear-on-exit" : "keep" })} />
        <Toggle name="permissions" label="Demander avant d’autoriser caméra, micro, position ou notifications" hint="Sinon toutes ces demandes sont refusées."
          checked={settings.permissions === "ask"} onChange={(value) => update({ permissions: value ? "ask" : "deny" })} />

        <fieldset className="grid gap-3 border-t border-border pt-3">
          <legend className="text-xs font-semibold uppercase text-text-muted">Leanna dans le navigateur</legend>
          <Row label="Niveau d’autonomie de l’agent">
            <select className={control} value={settings.agentMode} data-setting="agentMode" onChange={(event) => update({ agentMode: event.target.value as DesktopBrowserSettings["agentMode"] })}>
              <option value="observation">Observation — lit, n’agit pas</option>
              <option value="assistance">Assistance — chaque action est validée</option>
              <option value="autonomous">Autonome — actions courantes sans validation</option>
            </select>
          </Row>
          <Toggle name="confirmations" label="Confirmer chaque action, même en mode autonome"
            hint="Les actions sensibles (paiement, envoi, compte, suppression, téléchargement) sont toujours confirmées, quel que soit ce réglage."
            checked={settings.confirmations === "every-action"} onChange={(value) => update({ confirmations: value ? "every-action" : "sensitive-only" })} />
          <Toggle name="aiPanelOpen" label="Ouvrir le panneau Leanna au démarrage" checked={settings.aiPanelOpen} onChange={(value) => update({ aiPanelOpen: value })} />
        </fieldset>

        <fieldset className="grid gap-2 border-t border-border pt-3">
          <legend className="text-xs font-semibold uppercase text-text-muted">Autorisations des sites</legend>
          {sites.length === 0 && <p className="text-xs text-text-muted">Aucun choix mémorisé.</p>}
          {sites.map(([origin, entries]) => Object.entries(entries).map(([permission, decision]) => (
            <div key={`${origin}:${permission}`} className="flex items-center gap-2 text-xs" data-permission={origin}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-text">{origin}</span>
                {PERMISSION_LABELS[permission] ?? permission} : {decision === "allow" ? "autorisé" : "refusé"}</span>
              <Button size="sm" variant="ghost" onClick={() => void api.setPermission(origin, permission, null).then(loadPermissions)}>Oublier</Button>
            </div>
          )))}
        </fieldset>

        <fieldset className="grid gap-2 border-t border-border pt-3">
          <legend className="text-xs font-semibold uppercase text-text-muted">Données de navigation</legend>
          <Button size="sm" variant="secondary" onClick={() => void api.clearBrowsingData().then(() => setNotice("Cookies, données de sites et cache effacés.")).catch(() => setNotice("Effacement impossible."))}>
            Effacer cookies, données de sites et cache
          </Button>
          <p className="text-xs leading-4 text-text-muted">Favoris, historique et réglages restent sur cet ordinateur ; ils ne sont pas envoyés à Leanna.</p>
        </fieldset>
        {notice && <p role="status" className="text-xs text-text-muted">{notice}</p>}
      </div>
    </div>
  );
}
