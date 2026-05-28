"use client";

import { use, useEffect, useState } from "react";
import { RegisterForm } from "@/components/app/register-form";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type CatalogEventDetail } from "@/lib/catalog-api";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const [ev, setEv] = useState<CatalogEventDetail | null>(null);
  const [result, setResult] = useState<{ id: number; status: string } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setEv(await catalogApi.detail(eventId));
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [eventId]);

  async function register(answers: { field_id: number; value: string }[]) {
    try {
      const reg = await api.post<{ id: number; status: string }>(`/events/${eventId}/registrations`, { answers });
      setResult({ id: reg.id, status: reg.status });
    } catch (e) { setError((e as Error).message); }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!ev) return <p>Caricamento&hellip;</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{ev.title}</h1>
      <div className="text-sm text-gray-600">
        {new Date(ev.start_at).toLocaleString("it-IT")} — {new Date(ev.end_at).toLocaleString("it-IT")}
      </div>
      {ev.description && <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: ev.description }} />}
      <div className="text-sm">
        {ev.mode === "online" ? `Online${ev.online_url ? `: ${ev.online_url}` : ""}` : `${ev.location_name ?? ""} ${ev.address ?? ""}`}
      </div>
      <div className="text-sm text-gray-600">
        {ev.available_spots === null ? "Posti illimitati" : `${ev.available_spots} posti disponibili`}
        {ev.waitlist_enabled && ev.available_spots === 0 && " (lista d&apos;attesa attiva)"}
      </div>

      {result ? (
        <RegistrationReceipt registrationId={result.id} status={result.status} />
      ) : ev.my_status ? (
        <p className="rounded bg-blue-50 p-3 text-sm text-blue-800">Sei gi&agrave; iscritto (stato: {ev.my_status}).</p>
      ) : ev.registration_open ? (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-3 font-medium">Iscriviti</h2>
          <RegisterForm eventId={eventId} fields={ev.custom_fields} onSubmit={register} />
        </div>
      ) : (
        <p className="rounded bg-gray-100 p-3 text-sm text-gray-600">Iscrizioni non aperte.</p>
      )}
    </div>
  );
}
