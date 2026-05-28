import Link from "next/link";
import { headers } from "next/headers";
import { KpiCard } from "@/components/admin/kpi-card";
import { BarChart } from "@/components/admin/bar-chart";
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
    headers: { cookie },
    cache: "no-store",
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
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="rounded bg-yellow-50 p-4 text-sm text-yellow-800">
          Permesso <code>reports.read</code> necessario per visualizzare i KPI.
        </p>
        <p>
          <Link href="/admin/events" className="text-blue-600 underline">Vai agli eventi →</Link>
        </p>
      </div>
    );
  }

  const attendancePct = `${Math.round(kpis.attendance_rate * 100)}%`;
  const topEvent = kpis.top_events[0];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin" className="text-blue-600 hover:underline">tutto</Link>
          <span>·</span>
          <Link
            href={`/admin?date_from=${last30d()}`}
            className="text-blue-600 hover:underline"
          >30g</Link>
          <span>·</span>
          <Link
            href={`/admin?date_from=${last90d()}`}
            className="text-blue-600 hover:underline"
          >90g</Link>
          <span>·</span>
          <Link
            href={`/admin?date_from=${lastYear()}`}
            className="text-blue-600 hover:underline"
          >anno</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Eventi totali" value={kpis.events_total}
                 hint={`${kpis.events_published} pubblicati · ${kpis.events_upcoming} prossimi`} />
        <KpiCard label="Iscrizioni" value={kpis.registrations_total}
                 hint={`${kpis.registrations_confirmed} confermate · ${kpis.registrations_waitlisted} in attesa`} />
        <KpiCard label="Partecipazione" value={attendancePct}
                 hint={`${kpis.registrations_attended} presenti · ${kpis.registrations_no_show} no-show`} />
        <KpiCard label="Top evento" value={topEvent?.title ?? "—"}
                 hint={topEvent ? `${topEvent.confirmed} iscritti` : undefined} />
      </div>

      <BarChart
        title="Iscrizioni per mese (ultimi 12)"
        data={kpis.registrations_by_month.map((m) => ({ label: m.month, value: m.count }))}
      />

      <section>
        <h2 className="mb-2 text-lg font-medium">Top eventi (ultimi 90gg)</h2>
        <ul className="divide-y rounded border bg-white">
          {kpis.top_events.map((t) => (
            <li key={t.event_id} className="flex items-center justify-between p-3">
              <Link href={`/admin/events/${t.event_id}`} className="text-blue-600 hover:underline">
                {t.title}
              </Link>
              <span className="text-sm text-gray-600">{t.confirmed} iscritti</span>
            </li>
          ))}
          {kpis.top_events.length === 0 && (
            <li className="p-3 text-sm text-gray-500">Nessun evento recente.</li>
          )}
        </ul>
      </section>

      <div className="text-sm">
        <a
          className="text-blue-600 underline"
          href="/api/admin/reports/registrations.csv"
        >
          Esporta tutte le iscrizioni (CSV)
        </a>
      </div>
    </div>
  );
}

function last30d() { return _daysAgo(30); }
function last90d() { return _daysAgo(90); }
function lastYear() { return _daysAgo(365); }
function _daysAgo(n: number) {
  const d = new Date(Date.now() - n * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
