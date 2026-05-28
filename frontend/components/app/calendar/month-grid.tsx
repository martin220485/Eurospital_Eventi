import Link from "next/link";
import type { CatalogEvent } from "@/lib/catalog-api";
import { eachDay, isoDay, monthRange } from "@/lib/calendar-utils";

export function MonthGrid({ events, date }: { events: CatalogEvent[]; date: Date }) {
  const { from, to } = monthRange(date);
  const days = eachDay(from, to);
  const month = date.getMonth();
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
        <div key={d} className="p-1 text-center font-medium text-gray-500">{d}</div>
      ))}
      {days.map((d) => {
        const key = isoDay(d);
        const evs = events.filter((e) => isoDay(e.start_at) === key);
        return (
          <div key={key} className={`min-h-20 rounded border p-1 ${d.getMonth() === month ? "bg-white" : "bg-gray-50"}`}>
            <div className="text-right text-gray-400">{d.getDate()}</div>
            {evs.slice(0, 3).map((e) => (
              <Link key={e.id} href={`/app/events/${e.id}`} className="mb-0.5 block truncate rounded px-1"
                    style={{ background: e.category_color ?? "#e5e7eb" }}>{e.title}</Link>
            ))}
            {evs.length > 3 && <div className="text-gray-400">+{evs.length - 3}</div>}
          </div>
        );
      })}
    </div>
  );
}
