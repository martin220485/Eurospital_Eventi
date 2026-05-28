"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { RegistrationStatusBadge } from "./registration-status-badge";

type Row = {
  id: number; user_id: number; username: string; email: string;
  status: string; waitlist_position: number | null; checked_in: boolean;
};
type ListResult = { items: Row[]; total: number };

export function RegistrationsPanel({ eventId }: { eventId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await api.get<ListResult>(`/events/${eventId}/registrations?${params.toString()}`);
    setRows(res.items);
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [statusFilter]);

  async function act(id: number, action: "cancel" | "promote" | "no-show") {
    if (action === "cancel" && !window.confirm("Annullare l'iscrizione?")) return;
    try { await api.post(`/registrations/${id}/${action}`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select className="rounded border p-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tutti</option>
          {["confirmed", "waitlisted", "attended", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <table className="w-full rounded border bg-white text-sm">
        <thead className="bg-gray-50 text-left">
          <tr><th className="p-2">Utente</th><th className="p-2">Stato</th><th className="p-2">Pos.</th><th className="p-2">Check-in</th><th className="p-2">Azioni</th></tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-2">{r.username}<div className="text-xs text-gray-500">{r.email}</div></td>
              <td className="p-2"><RegistrationStatusBadge status={r.status} /></td>
              <td className="p-2">{r.waitlist_position ?? "—"}</td>
              <td className="p-2">{r.checked_in ? "✓" : "—"}</td>
              <td className="p-2 space-x-2">
                <a className="text-blue-700" href={`/api/registrations/${r.id}/qr`} target="_blank" rel="noreferrer">QR</a>
                {r.status === "waitlisted" && <button className="text-gray-700" onClick={() => act(r.id, "promote")}>Promuovi</button>}
                {r.status === "confirmed" && <button className="text-gray-700" onClick={() => act(r.id, "no-show")}>No-show</button>}
                {(r.status === "confirmed" || r.status === "waitlisted") && <button className="text-red-700" onClick={() => act(r.id, "cancel")}>Annulla</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
