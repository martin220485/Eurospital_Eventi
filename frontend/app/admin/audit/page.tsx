import { headers } from "next/headers";
import { ShieldAlert } from "lucide-react";
import { AnonymizeUser } from "@/components/admin/anonymize-user";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditLogItem } from "@/lib/audit-api";

async function fetchAudit(): Promise<{ items: AuditLogItem[]; total: number }> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/audit-logs?limit=100`, {
    headers: { cookie }, cache: "no-store",
  });
  if (!r.ok) return { items: [], total: 0 };
  return r.json();
}

export default async function AuditPage() {
  const data = await fetchAudit();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-brand-600" /> Audit & GDPR</h1>
        <p className="text-sm text-muted-foreground">Tracciamento azioni sensibili e gestione PII</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log</CardTitle>
          <CardDescription>Login, modifiche, sync LDAP, anonimizzazioni</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogTable initialItems={data.items} initialTotal={data.total} />
        </CardContent>
      </Card>

      <AnonymizeUser />
    </div>
  );
}
