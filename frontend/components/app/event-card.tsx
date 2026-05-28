import Link from "next/link";
import { CalendarDays, MapPin, Monitor, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CatalogEvent } from "@/lib/catalog-api";

export function EventCard({ event }: { event: CatalogEvent }) {
  const full = event.available_spots === 0;
  const isOnline = event.mode === "online";
  const ModeIcon = isOnline ? Monitor : MapPin;
  return (
    <Link href={`/app/events/${event.id}`} className="group block">
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card">
        <div className="h-1.5 rounded-t-lg" style={{ background: event.category_color ?? "#3a7fb3" }} />
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="border-brand-100 bg-brand-50 text-brand-700">
              {event.category_name ?? "Evento"}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ModeIcon className="h-3 w-3" />
              {event.mode === "online" ? "Online" : event.mode === "hybrid" ? "Ibrido" : "In sede"}
            </span>
          </div>

          <div>
            <h3 className="font-semibold leading-tight text-foreground group-hover:text-brand-700">
              {event.title}
            </h3>
            {event.short_description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.short_description}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(event.start_at).toLocaleString("it-IT", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {event.my_status === "confirmed" && <Badge variant="success">Iscritto</Badge>}
            {event.my_status === "waitlisted" && <Badge variant="warning">Lista d&apos;attesa</Badge>}
            {!event.my_status && full && <Badge variant="destructive">Posti esauriti</Badge>}
            {!event.my_status && !full && (
              <Badge>
                <Users className="mr-1 h-3 w-3" />
                {event.available_spots === null ? "Posti liberi" : `${event.available_spots} posti`}
              </Badge>
            )}
            {!event.registration_open && !event.my_status && (
              <span className="text-xs text-muted-foreground">Iscrizioni chiuse</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
