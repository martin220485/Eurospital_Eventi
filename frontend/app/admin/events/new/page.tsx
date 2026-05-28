"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EventForm } from "@/components/admin/event-form";
import { api } from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import type { EventInput } from "@/lib/event-schemas";

export default function NewEventPage() {
  const router = useRouter();

  async function create(data: EventInput) {
    try {
      const ev = await api.post<{ id: number }>("/events", data);
      toast.success("Evento creato — ora aggiungi campi custom, allegati e visibilità");
      router.push(`/admin/events/${ev.id}?tab=fields`);
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1>Nuovo evento</h1>
        <p className="text-sm text-muted-foreground">
          Compila i dati base. Dopo il salvataggio potrai aggiungere{" "}
          <strong>campi custom del form di iscrizione</strong>,{" "}
          <strong>allegati</strong> e <strong>visibilità per reparto/gruppo AD</strong>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dati evento</CardTitle>
        </CardHeader>
        <CardContent>
          <EventForm onSubmit={create} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
        <ArrowRight className="h-4 w-4" />
        Dopo &quot;Salva evento&quot;, ti porterò direttamente al tab <strong>Campi custom</strong> per aggiungere i campi del form di iscrizione (testo, select, checkbox, file upload, consensi…).
      </div>
    </div>
  );
}
