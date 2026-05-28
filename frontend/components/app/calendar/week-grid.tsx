import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { eachDay, isoDay, weekRange } from "@/lib/calendar-utils";

export function WeekGrid({ events, date }: { events: CatalogEvent[]; date: Date }) {
  const { from, to } = weekRange(date);
  const days = eachDay(from, to);
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {days.map((d) => {
        const key = isoDay(d);
        const evs = events.filter((e) => isoDay(e.start_at) === key);
        return (
          <div key={key} className="min-h-24 rounded border bg-white p-1">
            <div className="mb-1 font-medium">{d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}</div>
            {evs.map((e) => (
              <Link key={e.id} href={`/app/events/${e.id}`} className="mb-0.5 block truncate rounded px-1"
                    style={{ background: e.category_color ?? "#e5e7eb" }}>{e.title}</Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
