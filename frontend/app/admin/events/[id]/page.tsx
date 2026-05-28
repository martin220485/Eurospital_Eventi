"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AttachmentManager } from "@/components/admin/attachment-manager";
import { EventForm } from "@/components/admin/event-form";
import { EventReportPanel } from "@/components/admin/event-report-panel";
import { FieldBuilder } from "@/components/admin/field-builder";
import { ManualRegisterDialog } from "@/components/admin/manual-register-dialog";
import { RegistrationsPanel } from "@/components/admin/registrations-panel";
import { VisibilityEditor } from "@/components/admin/visibility-editor";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/admin-api";
import type { EventInput } from "@/lib/event-schemas";

const TABS = [
  { value: "details", label: "Dettagli" },
  { value: "fields", label: "Campi custom" },
  { value: "attachments", label: "Allegati" },
  { value: "visibility", label: "Visibilità" },
  { value: "registrations", label: "Iscritti" },
  { value: "report", label: "Report" },
] as const;

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const search = useSearchParams();
  const initialTab = (search.get("tab") as typeof TABS[number]["value"]) || "details";
  const [tab, setTab] = useState<string>(initialTab);
  const [initial, setInitial] = useState<Partial<EventInput> | null>(null);
  const [error, setError] = useState("");
  const [regRefresh, setRegRefresh] = useState(0);

  function load() {
    setError("");
    api.get<Record<string, unknown>>(`/events/${eventId}`).then((e) => {
      setInitial({
        ...e,
        start_at: String(e.start_at ?? "").slice(0, 16),
        end_at: String(e.end_at ?? "").slice(0, 16),
      } as Partial<EventInput>);
    }).catch((err) => setError((err as Error).message));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventId]);

  async function save(data: EventInput) {
    await api.patch(`/events/${eventId}`, data);
  }

  if (error) {
    return (
      <div className="max-w-4xl space-y-4">
        <h1>Evento #{eventId}</h1>
        <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">Impossibile caricare l&apos;evento. {error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="h-4 w-4" /> Riprova
          </Button>
        </Card>
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1>Evento #{eventId}</h1>
        <p className="text-sm text-muted-foreground">Configurazione e gestione</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="details">
          <Card className="p-5"><EventForm initial={initial} onSubmit={save} /></Card>
        </TabsContent>
        <TabsContent value="fields">
          <Card className="p-5"><FieldBuilder eventId={eventId} /></Card>
        </TabsContent>
        <TabsContent value="attachments">
          <Card className="p-5"><AttachmentManager eventId={eventId} /></Card>
        </TabsContent>
        <TabsContent value="visibility">
          <Card className="p-5"><VisibilityEditor eventId={eventId} /></Card>
        </TabsContent>
        <TabsContent value="registrations">
          <Card className="p-5 space-y-3">
            <ManualRegisterDialog eventId={eventId} onDone={() => setRegRefresh((n) => n + 1)} />
            <RegistrationsPanel key={regRefresh} eventId={eventId} />
          </Card>
        </TabsContent>
        <TabsContent value="report">
          <EventReportPanel eventId={eventId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
