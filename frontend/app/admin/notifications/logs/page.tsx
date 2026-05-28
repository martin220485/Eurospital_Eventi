import Link from "next/link";
import { headers } from "next/headers";
import { LogTable } from "@/components/admin/notifications/log-table";
import type { LogOut } from "@/lib/notifications-api";

async function fetchLogs(): Promise<{ items: LogOut[]; total: number }> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/notification-logs?limit=50`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!r.ok) return { items: [], total: 0 };
  return r.json();
}

export default async function LogsPage() {
  const data = await fetchLogs();
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Log notifiche</h1>
        <Link href="/admin/notifications" className="text-sm text-blue-600 underline">
          ← Torna ai template
        </Link>
      </div>
      <LogTable initialItems={data.items} initialTotal={data.total} />
    </div>
  );
}
