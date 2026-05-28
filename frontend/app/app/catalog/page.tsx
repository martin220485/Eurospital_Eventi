"use client";

import { useEffect, useState } from "react";
import { EventCard } from "@/components/app/event-card";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";

export default function CatalogPage() {
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await catalogApi.list(`?${params.toString()}`);
    setEvents(res.items);
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Catalogo eventi</h1>
      <div className="flex gap-2">
        <input className="rounded border p-2" placeholder="Cerca" value={q}
               onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        <button className="rounded border px-4 py-2" onClick={() => load()}>Cerca</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {events.length === 0 ? <p className="text-sm text-gray-500">Nessun evento disponibile.</p> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
