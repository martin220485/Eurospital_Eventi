"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { EventTable, type EventRow } from "@/components/admin/event-table";
import { api } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

type ListResult = { items: EventRow[]; total: number };

export default function EventsPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (q) params.set("q", q);
      const res = await api.get<ListResult>(`/events?${params.toString()}`);
      setItems(res.items);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

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
      await load();
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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cerca titolo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          />
        </div>
        <Button variant="outline" onClick={() => load()}>Cerca</Button>
      </div>

      <EventTable items={items} onAction={onAction} />
    </div>
  );
}
