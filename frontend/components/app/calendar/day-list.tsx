import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { isoDay } from "@/lib/calendar-utils";

export function DayList({ events, date }: { events: CatalogEvent[]; date: Date }) {
  const key = isoDay(date);
  const evs = events.filter((e) => isoDay(e.start_at) === key)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
      {evs.length === 0 ? <p className="text-sm text-gray-500">Nessun evento.</p> : (
        <ul className="space-y-1 text-sm">
          {evs.map((e) => (
            <li key={e.id} className="rounded border bg-white p-2">
              <Link className="text-blue-700" href={`/app/events/${e.id}`}>
                {new Date(e.start_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — {e.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
