import { headers } from "next/headers";
import { LdapConfigForm } from "@/components/admin/ldap/ldap-config-form";
import { SyncPanel } from "@/components/admin/ldap/sync-panel";
import type { LdapSettingsOut } from "@/lib/ldap-api";

async function fetchSettings(): Promise<LdapSettingsOut | null> {
  const h = await headers();
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
  const cookie = h.get("cookie") ?? "";
  const r = await fetch(`${base}/api/admin/ldap/settings`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function LdapSettingsPage() {
  const cfg = await fetchSettings();
  if (!cfg) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Impostazioni AD/LDAP</h1>
        <p className="rounded bg-yellow-50 p-4 text-sm text-yellow-800">
          Permesso <code>users.ldap_sync</code> necessario.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Impostazioni AD/LDAP</h1>
      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Configurazione</h2>
        <LdapConfigForm initial={cfg} />
      </section>
      <section className="rounded border bg-white p-4">
        <SyncPanel />
      </section>
    </div>
  );
}
