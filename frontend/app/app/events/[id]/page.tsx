"use client";

import { use, useEffect, useState } from "react";
import {
  ArrowLeft, Award, CalendarDays, CalendarPlus, Clock, Download, FileText,
  ListChecks, MapPin, Monitor, Paperclip, Tag, Users,
} from "lucide-react";
import Link from "next/link";
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
      toast.success(
        reg.status === "confirmed" ? "Iscrizione confermata!"
        : reg.status === "waitlisted" ? "Inserito in lista d'attesa"
        : "Iscrizione inviata"
      );
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  if (!ev) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-72" />
    </div>
  );

  const ModeIcon = ev.mode === "online" ? Monitor : MapPin;
  const start = new Date(ev.start_at);
  const end = new Date(ev.end_at);
  const sameDay = start.toDateString() === end.toDateString();
  const durationH = Math.round((end.getTime() - start.getTime()) / 36e5 * 10) / 10;
  const fullySoldOut = ev.available_spots === 0 && !ev.waitlist_enabled;
  const location =
    ev.mode === "online"
      ? (ev.online_url ?? "Online")
      : [ev.location_name, ev.address].filter(Boolean).join(" — ") || "—";

  const capPct = ev.capacity ? Math.min(100, Math.round((ev.confirmed_count / ev.capacity) * 100)) : 0;

  function fmtDate(d: Date) {
    return d.toLocaleString("it-IT", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/app/catalog"><ArrowLeft className="h-4 w-4" /> Torna al catalogo</Link>
      </Button>

      <div className="overflow-hidden rounded-xl border bg-gradient-to-r from-brand-50 via-white to-brand-50">
        <div className="h-2" style={{ background: ev.category_color ?? "#3a7fb3" }} />
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {ev.category_name && (
                  <Badge variant="outline" className="border-brand-100 bg-brand-50 text-brand-700">
                    <Tag className="mr-1 h-3 w-3" /> {ev.category_name}
                  </Badge>
                )}
                <Badge variant="secondary">
                  <ModeIcon className="mr-1 h-3 w-3" />
                  {ev.mode === "online" ? "Online" : ev.mode === "hybrid" ? "Ibrido" : "In sede"}
                </Badge>
                {ev.my_status === "confirmed" && <Badge variant="success">Sei iscritto/a</Badge>}
                {ev.my_status === "waitlisted" && <Badge variant="warning">In lista d&apos;attesa</Badge>}
              </div>
              <h1 className="leading-tight">{ev.title}</h1>
              {ev.short_description && (
                <p className="text-sm text-muted-foreground sm:text-base">{ev.short_description}</p>
              )}
            </div>
            <Button variant="outline" asChild>
              <a href={`/api/catalog/events/${eventId}/ics`}>
                <CalendarPlus className="h-4 w-4" /> Calendario
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dettagli</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex items-start gap-2 min-w-[180px]">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <div className="font-medium">{fmtDate(start)}</div>
                  <div className="text-xs text-muted-foreground">
                    {sameDay
                      ? `fino alle ${end.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                      : `→ ${fmtDate(end)}`}
                    {" "}· <Clock className="inline h-3 w-3" /> {durationH}h
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 min-w-[180px]">
                <ModeIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <div className="font-medium">{ev.mode === "online" ? "Evento online" : "Luogo"}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    {ev.mode === "online" && ev.online_url ? (
                      <a href={ev.online_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                        Apri link →
                      </a>
                    ) : location}
                  </div>
                </div>
              </div>
            </div>

            {ev.description && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Descrizione</h3>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: ev.description }} />
              </div>
            )}

            {ev.attachments.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Paperclip className="h-4 w-4 text-brand-600" /> Allegati ({ev.attachments.length})
                </h3>
                <ul className="space-y-1">
                  {ev.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={a.download_url}
                         className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-accent">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.filename}</span>
                        {a.size_bytes && (
                          <span className="text-xs text-muted-foreground">
                            {(a.size_bytes / 1024).toFixed(0)} KB
                          </span>
                        )}
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-brand-600" /> Disponibilità
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ev.capacity !== null ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Iscritti</span>
                  <span className="font-medium">{ev.confirmed_count} / {ev.capacity}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-50">
                  <div className="h-full bg-brand-500" style={{ width: `${capPct}%` }} />
                </div>
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Posti liberi</span>
                  <span>{ev.available_spots ?? "—"}</span>
                </div>
              </>
            ) : (
              <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
                <ListChecks className="mr-1 inline h-3 w-3" /> Capienza illimitata
              </div>
            )}
            {ev.waitlist_enabled && (
              <div className="flex items-baseline justify-between border-t pt-2">
                <span className="text-muted-foreground">Lista d&apos;attesa</span>
                <Badge variant="warning">{ev.waitlist_count}</Badge>
              </div>
            )}
            {ev.registration_open_at && (
              <p className="text-xs text-muted-foreground">
                Iscrizioni dal {new Date(ev.registration_open_at).toLocaleDateString("it-IT")}
              </p>
            )}
            {ev.registration_close_at && (
              <p className="text-xs text-muted-foreground">
                Chiusura iscrizioni: {new Date(ev.registration_close_at).toLocaleString("it-IT")}
              </p>
            )}
            {ev.cancellation_allowed && (
              <p className="text-xs text-muted-foreground">
                ✓ Annullamento consentito
                {ev.cancellation_deadline_at &&
                  ` entro ${new Date(ev.cancellation_deadline_at).toLocaleDateString("it-IT")}`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {result ? (
        <Card><CardContent className="p-5">
          <RegistrationReceipt registrationId={result.id} status={result.status} />
        </CardContent></Card>
      ) : ev.my_status ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="font-medium">
                Sei {ev.my_status === "confirmed" ? "iscritto/a" :
                     ev.my_status === "waitlisted" ? "in lista d'attesa" : "registrato/a"} a questo evento
              </div>
              <div className="text-xs text-muted-foreground">
                Vai a <Link href="/app/registrations" className="text-brand-700 hover:underline">Le mie iscrizioni</Link> per gestire o annullare.
              </div>
            </div>
            {ev.my_status === "attended" && (
              <Button variant="outline" asChild>
                <a href={`/api/catalog/registrations/${eventId}/certificate.pdf`}>
                  <Award className="h-4 w-4" /> Attestato (PDF)
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : ev.registration_open && !fullySoldOut ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {ev.available_spots === 0 && ev.waitlist_enabled
                ? "Iscriviti alla lista d'attesa"
                : "Iscriviti all'evento"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RegisterForm eventId={eventId} fields={ev.custom_fields} onSubmit={register} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {fullySoldOut
              ? "Posti esauriti e lista d'attesa non attiva."
              : "Le iscrizioni non sono attualmente aperte per questo evento."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
