"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, CalendarOff, History, RotateCw, Ticket, XCircle } from "lucide-react";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type MyEvent } from "@/lib/catalog-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";

export default function MyRegistrationsPage() {
  const [items, setItems] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    setLoading(true);
    try { setItems(await catalogApi.myEvents()); }
    catch (e) { setError((e as Error).message); }
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
      <li key={m.registration_id} className="rounded-lg border bg-card p-4">
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
        {m.status === "attended" && (
          <Button variant="outline" size="sm" className="mt-2" asChild>
            <a href={`/api/catalog/registrations/${m.registration_id}/certificate.pdf`}>
              <Award className="h-3.5 w-3.5" /> Scarica attestato
            </a>
          </Button>
        )}
        {opts.cancel && ["confirmed", "waitlisted"].includes(m.status) && (
          <Button variant="ghost" size="sm" className="mt-2 text-destructive hover:bg-destructive/10" onClick={() => cancel(m.registration_id)}>
            <XCircle className="h-3.5 w-3.5" /> Annulla iscrizione
          </Button>
        )}
      </li>
    );
  }

  function SkeletonList() {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
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

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Impossibile caricare le iscrizioni. {error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RotateCw className="h-4 w-4" /> Riprova
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="future">
          <TabsList>
            <TabsTrigger value="future">Futuri ({future.length})</TabsTrigger>
            <TabsTrigger value="past">Passati ({past.length})</TabsTrigger>
            <TabsTrigger value="cancelled">Annullati ({cancelled.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="future">
            {loading ? <SkeletonList /> : future.length === 0
              ? emptySection(Ticket, "Nessuna iscrizione futura.")
              : <ul className="space-y-3">{future.map((m) => row(m, { qr: true, cancel: true }))}</ul>}
          </TabsContent>
          <TabsContent value="past">
            {loading ? <SkeletonList /> : past.length === 0
              ? emptySection(History, "Nessuna iscrizione passata.")
              : <ul className="space-y-3">{past.map((m) => row(m, {}))}</ul>}
          </TabsContent>
          <TabsContent value="cancelled">
            {loading ? <SkeletonList /> : cancelled.length === 0
              ? emptySection(CalendarOff, "Nessuna iscrizione annullata.")
              : <ul className="space-y-3">{cancelled.map((m) => row(m, {}))}</ul>}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
