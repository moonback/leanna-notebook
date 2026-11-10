"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";

type Status = { connected: boolean; email: string | null };
export function GoogleDriveSettings() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/v1/integrations/google-drive", { cache: "no-store" });
    if (!response.ok) throw new Error("Impossible de lire l'état Google Drive.");
    setStatus(await response.json() as Status);
  }, []);
  React.useEffect(() => { void refresh().catch((e) => setError(e instanceof Error ? e.message : "Erreur inconnue.")); }, [refresh]);
  const disconnect = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/integrations/google-drive", { method: "DELETE" });
      if (!response.ok) throw new Error("La déconnexion a échoué.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur inconnue."); }
    finally { setBusy(false); }
  };

  return <Card className="grid gap-4 p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <h2 className="text-lg">Google Drive</h2>
        <p className="text-sm text-text-muted">Connectez un compte Google pour importer vos documents Drive dans un notebook.</p>
      </div>
      <span className="rounded-full border px-2.5 py-1 text-xs">{status?.connected ? "Connecté" : status ? "Non connecté" : "Vérification…"}</span>
    </div>
    {status?.connected ? <>
      <p className="text-sm">Compte associé : <strong>{status.email}</strong></p>
      <Button variant="secondary" disabled={busy} onClick={disconnect}>{busy ? "Déconnexion…" : "Déconnecter Google Drive"}</Button>
    </> : <form action="/api/v1/integrations/google-drive" method="post">
      <Button type="submit" disabled={!status || busy}>Connecter Google Drive</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <p className="text-xs text-text-subtle">Accès en lecture seule. Le jeton de renouvellement est chiffré côté serveur et n'est jamais envoyé au navigateur.</p>
  </Card>;
}
