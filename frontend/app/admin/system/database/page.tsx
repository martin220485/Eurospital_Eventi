"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Database, RefreshCw, Wrench } from "lucide-react";
import { platformApi } from "@/lib/admin-extra-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";

type DbStatus = Awaited<ReturnType<typeof platformApi.dbStatus>>;

export default function DatabasePage() {
  const [s, setS] = useState<DbStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setS(await platformApi.dbStatus()); }
    catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function migrate() {
    if (!window.confirm("Eseguire le migrazioni fino a head?")) return;
    setBusy(true);
    try {
      const res = await platformApi.dbMigrate();
      toast.success(`Migrato a revisione ${res.revision}`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function rebuild() {
    if (!window.confirm("Ricreare le tabelle/viste mancanti? Operazione idempotente, ma può essere lenta.")) return;
    setBusy(true);
    try {
      const res = await platformApi.dbRebuild();
      toast.success(`Schema riallineato (rev ${res.revision})`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1>Database</h1>
          <p className="text-sm text-muted-foreground">Stato schema, migrazioni Alembic, viste</p>
        </div>
        <Button variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Aggiorna
        </Button>
      </div>

      {!s ? <p className="text-sm text-muted-foreground">Caricamento…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-6 w-6 text-brand-600" />
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Revisione corrente</div>
                  <div className="font-mono text-sm">{s.current_revision ?? "—"}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-6 w-6 text-brand-600" />
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Revisione target</div>
                  <div className="font-mono text-sm">{s.head_revision ?? "—"}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                {s.up_to_date ? <Check className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-amber-600" />}
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Stato</div>
                  <div className="text-sm">
                    {s.up_to_date
                      ? <Badge variant="success">Aggiornato</Badge>
                      : <Badge variant="warning">Migrazioni da applicare</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Azioni</CardTitle>
              <CardDescription>
                Le migrazioni Alembic creano/aggiornano in modo idempotente tabelle, indici, viste e seed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={migrate} disabled={busy || s.up_to_date}>
                <Wrench className="h-4 w-4" /> Applica migrazioni
              </Button>
              <Button variant="outline" onClick={rebuild} disabled={busy}>
                <RefreshCw className="h-4 w-4" /> Riallinea schema (idempotente)
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tabelle ({s.tables.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {s.tables.map((t) => <code key={t} className="rounded bg-muted px-2 py-0.5">{t}</code>)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Viste ({s.views.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {s.views.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna vista definita.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {s.views.map((v) => <code key={v} className="rounded bg-muted px-2 py-0.5">{v}</code>)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
