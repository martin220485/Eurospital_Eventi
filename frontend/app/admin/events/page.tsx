"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EventTable, type EventRow } from "@/components/admin/event-table";
import { api } from "@/lib/admin-api";

type ListResult = { items: EventRow[]; total: number };

export default function EventsPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (q) params.set("q", q);
    const res = await api.get<ListResult>(`/events?${params.toString()}`);
    setItems(res.items);
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [statusFilter]);

  async function onAction(id: number, kind: "transition" | "duplicate", target?: string) {
    try {
      if (kind === "duplicate") await api.post(`/events/${id}/duplicate`);
      else await api.post(`/events/${id}/transition`, { target });
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Eventi</h1>
        <Link className="rounded bg-blue-600 px-4 py-2 text-white" href="/admin/events/new">Nuovo evento</Link>
      </div>
      <div className="flex gap-2">
        <select className="rounded border p-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {["draft", "published", "suspended", "cancelled", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="rounded border p-2" placeholder="Cerca titolo" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="rounded border px-4 py-2" onClick={() => load()}>Cerca</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <EventTable items={items} onAction={onAction} />
    </div>
  );
}
