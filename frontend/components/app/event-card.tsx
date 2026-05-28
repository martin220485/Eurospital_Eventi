import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";

export function EventCard({ event }: { event: CatalogEvent }) {
  const full = event.available_spots === 0;
  return (
    <Link href={`/app/events/${event.id}`} className="block rounded-lg border bg-white p-4 hover:shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs rounded px-2 py-0.5" style={{ background: event.category_color ?? "#eee" }}>
          {event.category_name ?? "Evento"}
        </span>
        <span className="text-xs text-gray-500">{event.mode === "online" ? "Online" : event.mode === "hybrid" ? "Ibrido" : "In sede"}</span>
      </div>
      <h3 className="mt-2 font-medium">{event.title}</h3>
      {event.short_description && <p className="text-sm text-gray-600">{event.short_description}</p>}
      <div className="mt-2 text-xs text-gray-500">{new Date(event.start_at).toLocaleString("it-IT")}</div>
      <div className="mt-2 flex gap-2 text-xs">
        {event.my_status
          ? <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{event.my_status}</span>
          : full
            ? <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">Posti esauriti</span>
            : <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">
                {event.available_spots === null ? "Posti liberi" : `${event.available_spots} posti`}
              </span>}
        {!event.registration_open && !event.my_status && <span className="text-gray-400">Iscrizioni chiuse</span>}
      </div>
    </Link>
  );
}
