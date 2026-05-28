"use client";

import { useEffect, useState } from "react";
import { reportsApi, type EventReportOut } from "@/lib/reports-api";

export function EventReportPanel({ eventId }: { eventId: number }) {
  const [data, setData] = useState<EventReportOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reportsApi.getEventReport(eventId)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "errore"));
  }, [eventId]);

  if (error) return <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">Caricamento…</p>;

  const att = `${Math.round(data.attendance_rate * 100)}%`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Confermati" value={data.counts.confirmed} />
        <Card label="In attesa" value={data.counts.waitlisted} />
        <Card label="Annullati" value={data.counts.cancelled} />
        <Card label="Presenti" value={data.counts.attended} />
        <Card label="No-show" value={data.counts.no_show} />
        <Card label="Partecipazione" value={att} />
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          href={reportsApi.eventCsvUrl(eventId)}
        >
          Esporta CSV iscritti
        </a>
        <a
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          href={`/api/admin/reports/events/${eventId}/report.pdf`}
        >
          Report PDF
        </a>
      </div>

      {data.custom_fields_summary.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg font-medium">Campi custom</h3>
          {data.custom_fields_summary.map((f) => (
            <div key={f.field_id} className="rounded border bg-white p-3">
              <div className="font-medium">{f.label} <code className="text-xs text-gray-500">{f.type}</code></div>
              {f.options.length === 0 ? (
                <p className="text-sm text-gray-500">Nessuna risposta aggregabile.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {f.options.map((o, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1">{o.value || <em className="text-gray-400">(vuoto)</em>}</td>
                        <td className="py-1 text-right text-gray-600">{o.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
