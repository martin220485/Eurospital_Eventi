import Link from "next/link";
import { headers } from "next/headers";

type TemplateRow = { code: string; name: string; updated_at: string };

async function fetchTemplates(): Promise<TemplateRow[]> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/notification-templates`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return r.json();
}

export default async function NotificationsPage() {
  const templates = await fetchTemplates();
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Notifiche</h1>
        <Link href="/admin/notifications/logs" className="text-sm text-blue-600 underline">
          Vedi log invii →
        </Link>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-medium">Template</h2>
        <ul className="divide-y rounded border bg-white">
          {templates.map((t) => (
            <li key={t.code} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{t.name}</div>
                <code className="text-xs text-gray-500">{t.code}</code>
              </div>
              <Link
                href={`/admin/notifications/templates/${t.code}`}
                className="text-sm text-blue-600 underline"
              >
                Modifica
              </Link>
            </li>
          ))}
          {templates.length === 0 && (
            <li className="p-3 text-sm text-gray-500">Nessun template.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
