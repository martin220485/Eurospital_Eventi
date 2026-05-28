"use client";

import { useState } from "react";
import { auditApi } from "@/lib/audit-api";

export function AnonymizeUser() {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const id = Number(userId);
    if (!id) return;
    if (!window.confirm(`Anonimizzare permanentemente utente #${id}? Operazione irreversibile.`)) return;
    setBusy(true); setMsg(null); setErr(null);
    try {
      const res = await auditApi.anonymizeUser(id);
      setMsg(`Utente #${res.user_id} anonimizzato.`);
      setUserId("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded border bg-white p-4">
      <h2 className="text-lg font-medium">Anonimizza utente (GDPR)</h2>
      <p className="text-sm text-gray-600">
        Rimuove PII dall&apos;utente; iscrizioni e audit log restano per integrità referenziale.
      </p>
      <div className="flex gap-2">
        <input
          aria-label="user-id"
          placeholder="ID utente"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <button onClick={submit} disabled={busy || !userId}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50">
          {busy ? "…" : "Anonimizza"}
        </button>
      </div>
      {msg && <div role="status" className="rounded bg-green-50 p-2 text-sm text-green-700">{msg}</div>}
      {err && <div role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}
    </div>
  );
}
