"use client";

import { useState } from "react";
import { api } from "@/lib/admin-api";

export function ManualRegisterDialog({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      await api.post(`/events/${eventId}/registrations`, { user_id: Number(userId), answers: [] });
      setOpen(false); setUserId(""); onDone();
    } catch (e) { setError((e as Error).message); }
  }

  if (!open) return <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => setOpen(true)}>Iscrivi manualmente</button>;
  return (
    <div className="rounded border bg-white p-3 space-y-2">
      <p className="text-sm font-medium">Iscrizione manuale</p>
      <input className="rounded border p-2 text-sm" placeholder="ID utente" value={userId} onChange={(e) => setUserId(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={submit}>Iscrivi</button>
        <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>Annulla</button>
      </div>
    </div>
  );
}
