"use client";

import { useState } from "react";
import { ldapApi, type LdapPreviewOut, type LdapSyncResult } from "@/lib/ldap-api";

export function SyncPanel() {
  const [username, setUsername] = useState("");
  const [preview, setPreview] = useState<LdapPreviewOut | null>(null);
  const [result, setResult] = useState<LdapSyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPreview() {
    if (!username) return;
    setBusy(true); setError(null); setPreview(null);
    try {
      const p = await ldapApi.preview(username);
      setPreview(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "errore");
    } finally {
      setBusy(false);
    }
  }

  async function onSyncUser() {
    if (!username) return;
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await ldapApi.syncUser(username));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "errore");
    } finally {
      setBusy(false);
    }
  }

  async function onSyncAll() {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await ldapApi.syncAll());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Sincronizzazione</h2>
      <div className="flex gap-2">
        <input
          aria-label="username"
          placeholder="username AD"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1 rounded border px-2 py-1 text-sm"
        />
        <button onClick={onPreview} disabled={busy || !username} className="rounded border px-3 py-1 text-sm">
          Anteprima
        </button>
        <button onClick={onSyncUser} disabled={busy || !username} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
          Sync utente
        </button>
      </div>

      <div>
        <button onClick={onSyncAll} disabled={busy} className="rounded border px-4 py-2 text-sm">
          Sync tutti gli utenti del gruppo
        </button>
      </div>

      {error && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {preview && (
        <div className="rounded border p-3 text-sm">
          <div><strong>DN:</strong> <code className="text-xs">{preview.dn}</code></div>
          <div><strong>Attributi:</strong> <pre className="overflow-x-auto text-xs">{JSON.stringify(preview.attrs, null, 2)}</pre></div>
          <div><strong>Gruppi:</strong> {preview.groups.join(", ") || "—"}</div>
          <div><strong>Ruoli mappati:</strong> {preview.mapped_roles.join(", ") || "—"}</div>
        </div>
      )}

      {result && (
        <div role="status" className="rounded bg-green-50 p-3 text-sm text-green-700">
          {result.action
            ? `Utente ${result.action} (id=${result.user_id})`
            : `Sync completato: creati ${result.created} · aggiornati ${result.updated} · errori ${result.errors}`}
        </div>
      )}
    </div>
  );
}
