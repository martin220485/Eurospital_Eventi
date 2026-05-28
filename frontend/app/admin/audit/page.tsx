import { headers } from "next/headers";
import { AnonymizeUser } from "@/components/admin/anonymize-user";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import type { AuditLogItem } from "@/lib/audit-api";

async function fetchAudit(): Promise<{ items: AuditLogItem[]; total: number }> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/audit-logs?limit=100`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!r.ok) return { items: [], total: 0 };
  return r.json();
}

export default async function AuditPage() {
  const data = await fetchAudit();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Audit log e GDPR</h1>
      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Audit log</h2>
        <AuditLogTable initialItems={data.items} initialTotal={data.total} />
      </section>
      <AnonymizeUser />
    </div>
  );
}
