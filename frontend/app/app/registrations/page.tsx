"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarOff, History, Ticket, XCircle } from "lucide-react";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type MyEvent } from "@/lib/catalog-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";

export default function MyRegistrationsPage() {
  const [items, setItems] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try { setItems(await catalogApi.myEvents()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function cancel(id: number) {
    if (!window.confirm("Annullare l'iscrizione?")) return;
    try {
      await api.post(`/registrations/${id}/cancel`);
      toast.success("Iscrizione annullata");
      await load();
    } catch (e) { toast.error((e as Error).message); }
  }

  const now = new Date();
  const future = items.filter((m) => new Date(m.event_start_at) >= now && m.status !== "cancelled");
  const past = items.filter((m) => new Date(m.event_start_at) < now && m.status !== "cancelled");
  const cancelled = items.filter((m) => m.status === "cancelled");

  function row(m: MyEvent, opts: { qr?: boolean; cancel?: boolean }) {
    return (
      <li key={m.registration_id} className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/app/events/${m.event_id}`} className="font-medium hover:text-brand-700">
              {m.event_title}
            </Link>
            <div className="text-xs text-muted-foreground">
              {new Date(m.event_start_at).toLocaleString("it-IT", {
                weekday: "short", day: "2-digit", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </div>
          </div>
          <Badge variant={
            m.status === "confirmed" ? "success" :
            m.status === "waitlisted" ? "warning" :
            m.status === "attended" ? "default" :
            "secondary"
          }>
            {m.status === "confirmed" ? "Confermata" :
             m.status === "waitlisted" ? "Lista d'attesa" :
             m.status === "attended" ? "Partecipata" :
             m.status === "cancelled" ? "Annullata" :
             m.status === "no_show" ? "Assente" : m.status}
          </Badge>
        </div>
        {opts.qr && m.status === "confirmed" && (
          <div className="mt-3"><RegistrationReceipt registrationId={m.registration_id} status={m.status} /></div>
        )}
        {opts.cancel && ["confirmed", "waitlisted"].includes(m.status) && (
          <Button variant="ghost" size="sm" className="mt-2 text-destructive hover:bg-destructive/10" onClick={() => cancel(m.registration_id)}>
            <XCircle className="h-3.5 w-3.5" /> Annulla iscrizione
          </Button>
        )}
      </li>
    );
  }

  function emptySection(icon: typeof Ticket, msg: string) {
    const Icon = icon;
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{msg}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Le mie iscrizioni</h1>
        <p className="text-sm text-muted-foreground">Gestisci futuri, passati e annullati</p>
      </div>

      <Tabs defaultValue="future">
        <TabsList>
          <TabsTrigger value="future">Futuri ({future.length})</TabsTrigger>
          <TabsTrigger value="past">Passati ({past.length})</TabsTrigger>
          <TabsTrigger value="cancelled">Annullati ({cancelled.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="future">
          {loading ? null : future.length === 0
            ? emptySection(Ticket, "Nessuna iscrizione futura.")
            : <ul className="space-y-3">{future.map((m) => row(m, { qr: true, cancel: true }))}</ul>}
        </TabsContent>
        <TabsContent value="past">
          {loading ? null : past.length === 0
            ? emptySection(History, "Nessuna iscrizione passata.")
            : <ul className="space-y-3">{past.map((m) => row(m, {}))}</ul>}
        </TabsContent>
        <TabsContent value="cancelled">
          {loading ? null : cancelled.length === 0
            ? emptySection(CalendarOff, "Nessuna iscrizione annullata.")
            : <ul className="space-y-3">{cancelled.map((m) => row(m, {}))}</ul>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
