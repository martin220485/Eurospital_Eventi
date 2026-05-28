import { headers } from "next/headers";
import { LdapConfigForm } from "@/components/admin/ldap/ldap-config-form";
import { SyncPanel } from "@/components/admin/ldap/sync-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="space-y-5">
        <div>
          <h1>Impostazioni AD/LDAP</h1>
          <p className="text-sm text-muted-foreground">Bind login, sync utenti, mappatura ruoli</p>
        </div>
        <Card>
          <CardContent className="p-5 text-sm">
            Permesso <code className="rounded bg-muted px-1.5 py-0.5">users.ldap_sync</code> necessario per gestire la configurazione.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Impostazioni AD/LDAP</h1>
        <p className="text-sm text-muted-foreground">Bind login, sync utenti, mappatura ruoli</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurazione</CardTitle>
        </CardHeader>
        <CardContent>
          <LdapConfigForm initial={cfg} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sincronizzazione</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncPanel />
        </CardContent>
      </Card>
    </div>
  );
}
