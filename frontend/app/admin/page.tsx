import Link from "next/link";
import { headers } from "next/headers";
import { Calendar, CheckCircle2, Download, TrendingUp, Trophy, Users } from "lucide-react";
import { KpiCard } from "@/components/admin/kpi-card";
import { BarChart } from "@/components/admin/bar-chart";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { KpiOut } from "@/lib/reports-api";

async function fetchKpis(searchParams: { date_from?: string; date_to?: string }): Promise<KpiOut | null> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const sp = new URLSearchParams();
  if (searchParams.date_from) sp.set("date_from", searchParams.date_from);
  if (searchParams.date_to) sp.set("date_to", searchParams.date_to);
  const qs = sp.toString();
  const r = await fetch(`${base}/api/admin/reports/kpis${qs ? `?${qs}` : ""}`, {
    headers: { cookie }, cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function AdminDashboard({
  searchParams,
}: { searchParams: Promise<{ date_from?: string; date_to?: string }> }) {
  const params = await searchParams;
  const kpis = await fetchKpis(params);

  if (!kpis) {
    return (
      <div className="space-y-4">
        <h1>Dashboard</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm">
              Permesso <code className="rounded bg-muted px-1.5 py-0.5">reports.read</code> necessario per visualizzare i KPI.
            </p>
            <Button asChild className="mt-3" variant="outline">
              <Link href="/admin/events">Vai agli eventi</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rate = Number.isFinite(kpis.attendance_rate) ? kpis.attendance_rate : 0;
  const attendancePct = `${Math.round(rate * 100)}%`;
  // Color carries state: green = healthy, amber = needs attention. Status only.
  const attendanceTone =
    kpis.registrations_total === 0 ? "default" : rate >= 0.8 ? "success" : rate < 0.6 ? "warning" : "default";
  const topEvent = kpis.top_events[0];

  const presets: { label: string; from?: string }[] = [
    { label: "Tutto" },
    { label: "30g", from: last(30) },
    { label: "90g", from: last(90) },
    { label: "Anno", from: last(365) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1>Dashboard</h1>
          <p className="text-sm text-muted-foreground">Panoramica eventi e iscrizioni</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 text-xs">
          {presets.map((p) => {
            const active =
              !params.date_to && (p.from ?? undefined) === (params.date_from ?? undefined);
            return (
              <Link
                key={p.label}
                href={p.from ? `/admin?date_from=${p.from}` : "/admin"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  active
                    ? "bg-brand-600 font-medium text-white"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {p.label}
              </Link>
            );
          })}
          <DateRangePicker from={params.date_from} to={params.date_to} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Eventi totali"
          value={kpis.events_total}
          hint={`${kpis.events_published} pubblicati · ${kpis.events_upcoming} prossimi`}
          icon={Calendar}
        />
        <KpiCard
          label="Iscrizioni"
          value={kpis.registrations_total}
          hint={`${kpis.registrations_confirmed} confermate · ${kpis.registrations_waitlisted} in attesa`}
          icon={Users}
        />
        <KpiCard
          label="Partecipazione"
          value={attendancePct}
          hint={`${kpis.registrations_attended} presenti · ${kpis.registrations_no_show} no-show`}
          icon={CheckCircle2}
          tone={attendanceTone}
          featured
        />
        <KpiCard
          label="Top evento"
          value={topEvent?.title ?? "—"}
          hint={topEvent ? `${topEvent.confirmed} iscritti` : "Nessun evento attivo"}
          icon={Trophy}
          compact
        />
      </div>

      <BarChart
        title="Iscrizioni per mese (ultimi 12)"
        data={kpis.registrations_by_month.map((m) => {
          const r = monthRange(m.month);
          return {
            label: m.month.slice(5),
            value: m.count,
            href: `/admin?date_from=${r.from}&date_to=${r.to}`,
          };
        })}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            Top eventi (ultimi 90 giorni)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {kpis.top_events.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Nessun evento recente.</p>
          ) : (
            <ul className="divide-y">
              {kpis.top_events.map((t) => (
                <li key={t.event_id} className="flex items-center justify-between px-6 py-3">
                  <Link
                    href={`/admin/events/${t.event_id}`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    {t.title}
                  </Link>
                  <span className="text-sm font-medium text-muted-foreground">{t.confirmed} iscritti</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Export iscrizioni globale (CSV UTF-8 BOM Excel-friendly)</p>
        <Button variant="outline" asChild>
          <a href="/api/admin/reports/registrations.csv">
            <Download className="h-4 w-4" />
            Esporta CSV
          </a>
        </Button>
      </div>
    </div>
  );
}

function last(d: number) {
  return new Date(Date.now() - d * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, "0")}` };
}
