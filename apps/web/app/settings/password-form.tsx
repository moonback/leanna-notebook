"use client";

import * as React from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { SettingsRow, SettingsSection } from "./settings-ui";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 12) {
      setError("Le nouveau mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/v1/me/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error === "current_password_invalid"
          ? "Votre mot de passe actuel est incorrect."
          : payload.error === "weak_password"
            ? "Le nouveau mot de passe est trop faible."
            : "Impossible de modifier le mot de passe. Réessayez.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Mot de passe modifié", description: "Votre compte utilise maintenant le nouveau mot de passe.", tone: "success" });
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection title="Mot de passe" description="Confirmez votre mot de passe actuel avant d'en choisir un nouveau.">
      <form onSubmit={onSubmit}>
        <div className="grid gap-4 p-5">
          <SettingsRow label="Mot de passe actuel" htmlFor="current-password">
            <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </SettingsRow>
          <SettingsRow label="Nouveau mot de passe" htmlFor="new-password" description="12 caractères minimum. Utilisez une phrase de passe unique.">
            <Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </SettingsRow>
          <SettingsRow label="Confirmer le nouveau mot de passe" htmlFor="confirm-password">
            <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </SettingsRow>
          {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="flex items-center gap-2 text-xs text-text-subtle"><ShieldCheck size={15} /> Vérification de votre identité avant modification</p>
            <Button type="submit" loading={saving} disabled={!currentPassword || !newPassword || !confirmPassword}><KeyRound size={15} /> Modifier</Button>
          </div>
        </div>
      </form>
    </SettingsSection>
  );
}
