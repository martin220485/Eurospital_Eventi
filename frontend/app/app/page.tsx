"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { catalogApi, type CatalogEvent, type MyEvent } from "@/lib/catalog-api";

export default function DashboardPage() {
  const [mine, setMine] = useState<MyEvent[]>([]);
  const [featured, setFeatured] = useState<CatalogEvent[]>([]);

  useEffect(() => {
    catalogApi.myEvents().then(setMine).catch(() => {});
    catalogApi.list("?page=1&page_size=4").then((r) => setFeatured(r.items)).catch(() => {});
  }, []);

  const upcoming = mine.filter((m) => ["confirmed", "waitlisted"].includes(m.status)
    && new Date(m.event_start_at) >= new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ciao!</h1>
      <section>
        <h2 className="mb-2 font-medium">Le tue prossime iscrizioni</h2>
        {upcoming.length === 0 ? <p className="text-sm text-gray-500">Nessuna iscrizione futura.</p> : (
          <ul className="space-y-1 text-sm">
            {upcoming.map((m) => (
              <li key={m.registration_id} className="rounded border bg-white p-2">
                <Link className="text-blue-700" href={`/app/events/${m.event_id}`}>{m.event_title}</Link>
                {" — "}{new Date(m.event_start_at).toLocaleString("it-IT")} ({m.status})
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-medium">Eventi in evidenza</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {featured.map((e) => (
            <Link key={e.id} href={`/app/events/${e.id}`} className="rounded border bg-white p-3 hover:shadow">
              <div className="font-medium">{e.title}</div>
              <div className="text-xs text-gray-500">{new Date(e.start_at).toLocaleString("it-IT")}</div>
            </Link>
          ))}
        </div>
        <Link className="mt-3 inline-block text-sm text-blue-700" href="/app/catalog">Vedi tutto il catalogo →</Link>
      </section>
    </div>
  );
}
