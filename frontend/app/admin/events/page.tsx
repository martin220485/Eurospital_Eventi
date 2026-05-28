"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RotateCw, Search } from "lucide-react";
import { EventTable, type EventRow } from "@/components/admin/event-table";
import { api } from "@/lib/admin-api";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

type ListResult = { items: EventRow[]; total: number };

export default function EventsPage() {
  const [items, setItems] = useState<EventRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const debouncedQ = useDebounced(q);

  const load = useCallback(async (search: string, status: string) => {
    setError("");
    setPending(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search.trim()) params.set("q", search.trim());
      const res = await api.get<ListResult>(`/events?${params.toString()}`);
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => { load(debouncedQ, statusFilter); }, [debouncedQ, statusFilter, load]);

  async function onAction(id: number, kind: "transition" | "duplicate" | "delete", target?: string) {
    try {
      if (kind === "duplicate") {
        await api.post(`/events/${id}/duplicate`);
        toast.success("Evento duplicato");
      } else if (kind === "delete") {
        await api.del(`/events/${id}`);
        toast.success("Evento eliminato");
      } else {
        await api.post(`/events/${id}/transition`, { target });
        toast.success(target === "cancelled"
          ? "Evento annullato e iscritti notificati via email"
          : `Stato → ${target}`);
      }
      await load(debouncedQ, statusFilter);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1>Eventi</h1>
          <p className="text-sm text-muted-foreground">Crea, pubblica e gestisci eventi aziendali</p>
        </div>
        <Button asChild>
          <Link href="/admin/events/new"><Plus className="h-4 w-4" /> Nuovo evento</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="draft">Bozza</SelectItem>
            <SelectItem value="published">Pubblicato</SelectItem>
            <SelectItem value="suspended">Sospeso</SelectItem>
            <SelectItem value="cancelled">Annullato</SelectItem>
            <SelectItem value="archived">Archiviato</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cerca titolo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cerca eventi"
          />
          {pending && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {items !== null && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {items.length} {items.length === 1 ? "evento" : "eventi"}
          </span>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Impossibile caricare gli eventi. {error}</p>
            <Button variant="outline" size="sm" onClick={() => load(debouncedQ, statusFilter)}>
              <RotateCw className="h-4 w-4" /> Riprova
            </Button>
          </CardContent>
        </Card>
      ) : items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : (
        <EventTable items={items} onAction={onAction} />
      )}
    </div>
  );
}
