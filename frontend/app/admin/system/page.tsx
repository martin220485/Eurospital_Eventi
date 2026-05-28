"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Database, Mail, RefreshCw, RotateCw, Server, X } from "lucide-react";
import { platformApi } from "@/lib/admin-extra-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Status = Awaited<ReturnType<typeof platformApi.status>>;

const NAMES: Record<string, string> = {
  db: "Database MySQL",
  redis: "Redis (broker)",
  smtp: "SMTP",
  ldap: "AD/LDAP",
};

const ICONS: Record<string, typeof Database> = {
  db: Database,
  redis: Server,
  smtp: Mail,
  ldap: Server,
};

export default function SystemStatusPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try { setStatus(await platformApi.status()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function badge(v: string) {
    if (v === "ok") return <Badge variant="success"><Check className="h-3 w-3" /> Operativo</Badge>;
    if (v === "configured") return <Badge variant="success"><Check className="h-3 w-3" /> Configurato</Badge>;
    if (v === "not-configured") return <Badge variant="warning"><AlertTriangle className="h-3 w-3" /> Non configurato</Badge>;
    return <Badge variant="destructive"><X className="h-3 w-3" /> {v}</Badge>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1>Stato sistema</h1>
          <p className="text-sm text-muted-foreground">Salute servizi e ultimi errori</p>
        </div>
        <Button variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Aggiorna
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Impossibile caricare lo stato. {error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RotateCw className="h-4 w-4" /> Riprova
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && !status && (
        <div className="space-y-4">
          <Skeleton className="h-5 w-64" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-40" />
        </div>
      )}

      {status && (
        <>
          <div className="flex items-center gap-3 text-sm">
            Stato generale: {badge(status.status)}
            <span className="text-muted-foreground">Versione: <code className="text-xs">{status.version}</code></span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(status.checks).map(([key, v]) => {
              const Icon = ICONS[key] ?? Server;
              return (
                <Card key={key}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon className="h-5 w-5" /></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{NAMES[key] ?? key}</div>
                      <div className="mt-1">{badge(v)}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ultimi errori notifiche</CardTitle>
              <CardDescription>Tentativi di invio falliti</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {status.recent_failed_notifications.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">Nessun errore recente.</p>
              ) : (
                <ul className="divide-y">
                  {status.recent_failed_notifications.map((n) => (
                    <li key={String(n.id)} className="px-6 py-3 text-sm">
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium">{String(n.template_code)}</span>
                        <span className="text-xs text-muted-foreground">{String(n.to_address)}</span>
                      </div>
                      <div className="mt-1 font-mono text-xs text-destructive">{String(n.error_text ?? "")}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Audit log retention: <strong>{status.audit_retention_days}</strong> giorni
          </p>
        </>
      )}
    </div>
  );
}
