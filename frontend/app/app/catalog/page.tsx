"use client";

import { useEffect, useState } from "react";
import { Calendar, Search } from "lucide-react";
import { EventCard } from "@/components/app/event-card";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogPage() {
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    try {
      const res = await catalogApi.list(`?${params.toString()}`);
      setEvents(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1>Catalogo eventi</h1>
        <p className="text-sm text-muted-foreground">Sfoglia gli eventi disponibili e iscriviti</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cerca eventi…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          />
        </div>
        <Button onClick={() => load()}>Cerca</Button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {events === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nessun evento disponibile</p>
            <p className="text-sm text-muted-foreground">Torna più tardi o cambia i criteri di ricerca.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
