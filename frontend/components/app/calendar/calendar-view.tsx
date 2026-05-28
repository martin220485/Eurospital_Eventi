"use client";

import { useEffect, useState } from "react";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";
import { dayRange, monthRange, weekRange } from "@/lib/calendar-utils";
import { AgendaList } from "./agenda-list";
import { DayList } from "./day-list";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";

type View = "month" | "week" | "day" | "list";
const VIEWS: [View, string][] = [["month", "Mese"], ["week", "Settimana"], ["day", "Giorno"], ["list", "Lista"]];

export function CalendarView() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CatalogEvent[]>([]);

  useEffect(() => {
    const range = view === "week" ? weekRange(cursor) : view === "day" ? dayRange(cursor) : monthRange(cursor);
    const qs = `?from=${range.from.toISOString()}&to=${range.to.toISOString()}&page_size=500`;
    catalogApi.list(qs).then((r) => setEvents(r.items)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  function shift(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {VIEWS.map(([v, label]) => (
            <button key={v} className={`rounded px-3 py-1 text-sm ${view === v ? "bg-blue-600 text-white" : "border"}`}
                    onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button className="rounded border px-2 py-1 text-sm" onClick={() => shift(-1)}>&#8249;</button>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => setCursor(new Date())}>Oggi</button>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => shift(1)}>&#8250;</button>
        </div>
      </div>
      {view === "month" && <MonthGrid events={events} date={cursor} />}
      {view === "week" && <WeekGrid events={events} date={cursor} />}
      {view === "day" && <DayList events={events} date={cursor} />}
      {view === "list" && <AgendaList events={events} />}
    </div>
  );
}
