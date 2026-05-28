"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type MyEvent } from "@/lib/catalog-api";

export default function MyRegistrationsPage() {
  const [items, setItems] = useState<MyEvent[]>([]);
  const [error, setError] = useState("");

  async function load() { setItems(await catalogApi.myEvents()); }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  async function cancel(id: number) {
    if (!window.confirm("Annullare l'iscrizione?")) return;
    try { await api.post(`/registrations/${id}/cancel`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  const now = new Date();
  const future = items.filter((m) => new Date(m.event_start_at) >= now && m.status !== "cancelled");
  const past = items.filter((m) => new Date(m.event_start_at) < now && m.status !== "cancelled");
  const cancelled = items.filter((m) => m.status === "cancelled");

  function section(title: string, list: MyEvent[], opts: { qr?: boolean; cancel?: boolean }) {
    return (
      <section>
        <h2 className="mb-2 font-medium">{title}</h2>
        {list.length === 0 ? <p className="text-sm text-gray-500">Nessuna.</p> : (
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.registration_id} className="rounded border bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link className="text-blue-700" href={`/app/events/${m.event_id}`}>{m.event_title}</Link>
                  <span className="text-xs">{new Date(m.event_start_at).toLocaleString("it-IT")} — {m.status}</span>
                </div>
                {opts.qr && m.status === "confirmed" && (
                  <div className="mt-2"><RegistrationReceipt registrationId={m.registration_id} status={m.status} /></div>
                )}
                {opts.cancel && ["confirmed", "waitlisted"].includes(m.status) && (
                  <button className="mt-2 text-xs text-red-700" onClick={() => cancel(m.registration_id)}>Annulla iscrizione</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Le mie iscrizioni</h1>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {section("Futuri", future, { qr: true, cancel: true })}
      {section("Passati", past, {})}
      {section("Annullati", cancelled, {})}
    </div>
  );
}
