"use client";

import { use, useEffect, useState } from "react";
import { CalendarPlus, MapPin, Monitor, Users } from "lucide-react";
import { RegisterForm } from "@/components/app/register-form";
import { RegistrationReceipt } from "@/components/app/registration-receipt";
import { api } from "@/lib/admin-api";
import { catalogApi, type CatalogEventDetail } from "@/lib/catalog-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const [ev, setEv] = useState<CatalogEventDetail | null>(null);
  const [result, setResult] = useState<{ id: number; status: string } | null>(null);

  async function load() {
    try { setEv(await catalogApi.detail(eventId)); }
    catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [eventId]);

  async function register(answers: { field_id: number; value: string }[]) {
    try {
      const reg = await api.post<{ id: number; status: string }>(`/events/${eventId}/registrations`, { answers });
      setResult({ id: reg.id, status: reg.status });
      toast.success("Iscrizione completata");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  if (!ev) return (
    <div className="max-w-3xl space-y-4">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-40" />
    </div>
  );

  const ModeIcon = ev.mode === "online" ? Monitor : MapPin;
  const location = ev.mode === "online"
    ? (ev.online_url ? `Online: ${ev.online_url}` : "Online")
    : [ev.location_name, ev.address].filter(Boolean).join(" — ");

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1>{ev.title}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(ev.start_at).toLocaleString("it-IT", {
              weekday: "long", day: "2-digit", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })} → {new Date(ev.end_at).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={`/api/catalog/events/${eventId}/ics`}>
            <CalendarPlus className="h-4 w-4" /> Aggiungi al calendario (.ics)
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ModeIcon className="h-4 w-4" /> {location || "—"}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" />
              {ev.available_spots === null ? "Posti illimitati" : `${ev.available_spots} posti disponibili`}
              {ev.waitlist_enabled && ev.available_spots === 0 && " (lista d'attesa attiva)"}
            </span>
          </div>
          {ev.description && (
            <div className="prose prose-sm max-w-none border-t pt-3" dangerouslySetInnerHTML={{ __html: ev.description }} />
          )}
        </CardContent>
      </Card>

      {result ? (
        <RegistrationReceipt registrationId={result.id} status={result.status} />
      ) : ev.my_status ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="font-medium">Sei già iscritto/a</div>
              <div className="text-sm text-muted-foreground">
                Stato: <Badge variant={ev.my_status === "confirmed" ? "success" : "warning"}>{ev.my_status}</Badge>
              </div>
            </div>
            {ev.my_status === "attended" && (
              <Button variant="outline" asChild>
                <a href={`/api/catalog/registrations/${eventId}/certificate.pdf`}>
                  Scarica attestato (PDF)
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : ev.registration_open ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Iscrizione</CardTitle>
          </CardHeader>
          <CardContent>
            <RegisterForm eventId={eventId} fields={ev.custom_fields} onSubmit={register} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Iscrizioni non aperte per questo evento.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
