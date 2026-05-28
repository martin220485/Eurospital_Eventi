import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { groupByDay } from "@/lib/calendar-utils";

export function AgendaList({ events }: { events: CatalogEvent[] }) {
  const groups = [...groupByDay(events).entries()].sort();
  if (groups.length === 0) return <p className="text-sm text-gray-500">Nessun evento nel periodo.</p>;
  return (
    <div className="space-y-3">
      {groups.map(([day, evs]) => (
        <div key={day}>
          <div className="text-sm font-medium">{new Date(day).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
          <ul className="ml-2 text-sm">
            {evs.map((e) => (
              <li key={e.id}><Link className="text-blue-700" href={`/app/events/${e.id}`}>
                {new Date(e.start_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} — {e.title}
              </Link></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
