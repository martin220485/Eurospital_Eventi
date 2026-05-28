"use client";

import { use, useEffect, useState } from "react";
import { AttachmentManager } from "@/components/admin/attachment-manager";
import { EventForm } from "@/components/admin/event-form";
import { EventReportPanel } from "@/components/admin/event-report-panel";
import { FieldBuilder } from "@/components/admin/field-builder";
import { ManualRegisterDialog } from "@/components/admin/manual-register-dialog";
import { RegistrationsPanel } from "@/components/admin/registrations-panel";
import { VisibilityEditor } from "@/components/admin/visibility-editor";
import { api } from "@/lib/admin-api";
import type { EventInput } from "@/lib/event-schemas";

const TABS = ["Dettagli", "Campi custom", "Allegati", "Visibilità", "Iscritti", "Report"] as const;

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Dettagli");
  const [initial, setInitial] = useState<Partial<EventInput> | null>(null);
  const [msg, setMsg] = useState("");
  const [regRefresh, setRegRefresh] = useState(0);

  useEffect(() => {
    api.get<Record<string, unknown>>(`/events/${eventId}`).then((e) => {
      setInitial({
        ...e,
        start_at: String(e.start_at ?? "").slice(0, 16),
        end_at: String(e.end_at ?? "").slice(0, 16),
      } as Partial<EventInput>);
    }).catch((err) => setMsg((err as Error).message));
  }, [eventId]);

  async function save(data: EventInput) {
    await api.patch(`/events/${eventId}`, data);
    setMsg("Salvato.");
  }

  if (!initial) return <p>Caricamento&hellip;</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Modifica evento</h1>
      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button key={t} className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {tab === "Dettagli" && <EventForm initial={initial} onSubmit={save} />}
      {tab === "Campi custom" && <FieldBuilder eventId={eventId} />}
      {tab === "Allegati" && <AttachmentManager eventId={eventId} />}
      {tab === "Visibilità" && <VisibilityEditor eventId={eventId} />}
      {tab === "Iscritti" && (
        <div className="space-y-3">
          <ManualRegisterDialog eventId={eventId} onDone={() => setRegRefresh((n) => n + 1)} />
          <RegistrationsPanel key={regRefresh} eventId={eventId} />
        </div>
      )}
      {tab === "Report" && <EventReportPanel eventId={eventId} />}
    </div>
  );
}
