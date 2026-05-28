"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import itLocale from "@fullcalendar/core/locales/it";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";
import { Card } from "@/components/ui/card";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#10b981",
  waitlisted: "#f59e0b",
  cancelled: "#9ca3af",
  attended: "#3b82f6",
  default: "#3a7fb3",
};

export function CalendarView() {
  const calRef = useRef<FullCalendar | null>(null);
  const router = useRouter();
  const [events, setEvents] = useState<CatalogEvent[]>([]);

  useEffect(() => {
    catalogApi.list("?page_size=500").then((r) => setEvents(r.items)).catch(() => {});
  }, []);

  const fcEvents = events.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start_at,
    end: e.end_at ?? undefined,
    backgroundColor: STATUS_COLORS[e.my_status ?? "default"] ?? STATUS_COLORS.default,
    borderColor: "transparent",
  }));

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS.confirmed }} /> Confermata</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS.waitlisted }} /> In attesa</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS.attended }} /> Presente</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS.default }} /> Disponibile</span>
      </div>
      <FullCalendar
        ref={calRef as never}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={itLocale}
        height="auto"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
        }}
        buttonText={{ today: "Oggi", month: "Mese", week: "Settimana", day: "Giorno", list: "Lista" }}
        events={fcEvents}
        eventClick={(info) => router.push(`/app/events/${info.event.id}`)}
        nowIndicator
        dayMaxEvents={3}
      />
    </Card>
  );
}
