"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck2, Sparkles } from "lucide-react";
import { catalogApi, type CatalogEvent, type MyEvent } from "@/lib/catalog-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/app/event-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const [mine, setMine] = useState<MyEvent[] | null>(null);
  const [featured, setFeatured] = useState<CatalogEvent[] | null>(null);

  useEffect(() => {
    catalogApi.myEvents().then(setMine).catch(() => setMine([]));
    catalogApi.list("?page=1&page_size=4").then((r) => setFeatured(r.items)).catch(() => setFeatured([]));
  }, []);

  const upcoming = (mine ?? []).filter(
    (m) => ["confirmed", "waitlisted"].includes(m.status) && new Date(m.event_start_at) >= new Date(),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1>Bentornato/a</h1>
        <p className="text-sm text-muted-foreground">Riepilogo eventi e iscrizioni</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck2 className="h-4 w-4 text-brand-600" />
            Le tue prossime iscrizioni
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {mine === null ? (
            <div className="space-y-2 px-6">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : upcoming.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">
              Nessuna iscrizione futura. <Link href="/app/catalog" className="text-brand-700 hover:underline">Sfoglia il catalogo →</Link>
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((m) => (
                <li key={m.registration_id} className="flex items-center justify-between px-6 py-3">
                  <div className="min-w-0">
                    <Link href={`/app/events/${m.event_id}`} className="font-medium text-foreground hover:text-brand-700">
                      {m.event_title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {new Date(m.event_start_at).toLocaleString("it-IT", {
                        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <Badge variant={m.status === "confirmed" ? "success" : "warning"}>
                    {m.status === "confirmed" ? "Confermata" : "In attesa"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="!text-base">Eventi in evidenza</h2>
          </div>
          <Button variant="link" asChild className="h-auto px-0">
            <Link href="/app/catalog">
              Vedi tutto il catalogo
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {featured === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : featured.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Nessun evento disponibile al momento.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {featured.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </section>
    </div>
  );
}
