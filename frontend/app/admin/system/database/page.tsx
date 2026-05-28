"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, Check, Database, PlugZap,
  RefreshCw, RotateCw, Sparkles, Undo, Wrench,
} from "lucide-react";
import { platformApi } from "@/lib/admin-extra-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

type DbStatus = Awaited<ReturnType<typeof platformApi.dbStatus>>;
type DbTarget = Awaited<ReturnType<typeof platformApi.dbGetTarget>>;

export default function DatabasePage() {
  const [s, setS] = useState<DbStatus | null>(null);
  const [target, setTarget] = useState<DbTarget | null>(null);
  const [form, setForm] = useState({ host: "", port: 3306, db: "", user: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadAll() {
    setError("");
    try {
      const [st, tg] = await Promise.all([platformApi.dbStatus(), platformApi.dbGetTarget()]);
      setS(st);
      setTarget(tg);
      setForm({
        host: tg.host ?? "", port: tg.port, db: tg.db,
        user: tg.user ?? "", password: "",
      });
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { loadAll(); }, []);

  async function migrate() {
    if (!window.confirm("Eseguire le migrazioni fino a head sul DB attivo?")) return;
    setBusy(true);
    try {
      const res = await platformApi.dbMigrate();
      toast.success(`Migrato a revisione ${res.revision}`);
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function rebuild() {
    if (!window.confirm("Riallineare lo schema sul DB attivo? Idempotente.")) return;
    setBusy(true);
    try { await platformApi.dbRebuild(); toast.success("Schema riallineato"); loadAll(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  function payload() {
    return {
      host: form.host, port: Number(form.port), db: form.db, user: form.user,
      password: form.password || undefined,
    };
  }

  async function testTarget() {
    setBusy(true);
    try {
      const res = await platformApi.dbTestTarget(payload());
      if (res.ok) toast.success("Connessione OK");
      else toast.error(`Test fallito: ${res.error}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function prepareTarget() {
    if (!window.confirm("Applicare le migrazioni sul DB di destinazione? Crea tabelle/viste/seed.")) return;
    setBusy(true);
    try {
      await platformApi.dbPrepareTarget(payload());
      toast.success("DB destinazione preparato (migrato a head)");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function switchTarget() {
    if (!window.confirm(
      "Cambiare la connessione live sul nuovo DB?\n\n" +
      "Le richieste in volo terminano col vecchio engine.\n" +
      "Worker e beat continuano col vecchio fino al restart container."
    )) return;
    setBusy(true);
    try {
      const res = await platformApi.dbSwitch(payload());
      toast.success("Connessione DB cambiata");
      if (res.warning) toast.message?.(res.warning);
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function resetOverride() {
    if (!window.confirm("Tornare alla connessione del .env e rimuovere l'override?")) return;
    setBusy(true);
    try { await platformApi.dbResetOverride(); toast.success("Override rimosso"); loadAll(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1>Database</h1>
          <p className="text-sm text-muted-foreground">Stato, migrazioni e gestione connessione</p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Aggiorna
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Impossibile caricare lo stato del database. {error}</p>
            <Button variant="outline" size="sm" onClick={loadAll}>
              <RotateCw className="h-4 w-4" /> Riprova
            </Button>
          </CardContent>
        </Card>
      ) : !s ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-6 w-6 text-brand-600" />
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Revisione attuale</div>
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
                      : <Badge variant="warning">Migrazioni mancanti</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Azioni sul DB attivo</CardTitle>
              <CardDescription>Migrazioni Alembic + riallineamento idempotente</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={migrate} disabled={busy || s.up_to_date}>
                <Wrench className="h-4 w-4" /> Applica migrazioni
              </Button>
              <Button variant="outline" onClick={rebuild} disabled={busy}>
                <Sparkles className="h-4 w-4" /> Riallinea schema
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PlugZap className="h-4 w-4 text-brand-600" /> Connessione attiva
              </CardTitle>
              <CardDescription>
                Origine: <Badge variant={target?.source === "override" ? "warning" : "secondary"}>
                  {target?.source === "override" ? "Override DB" : "Variabili .env"}
                </Badge>
                {target?.source === "override" && (
                  <Button variant="ghost" size="sm" className="ml-2" onClick={resetOverride} disabled={busy}>
                    <Undo className="h-3 w-3" /> Torna a .env
                  </Button>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); testTarget(); }} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="db-host">Host</Label>
                    <Input id="db-host" placeholder="db.aziendale.local" value={form.host}
                           onChange={(e) => setForm({ ...form, host: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="db-port">Porta</Label>
                    <Input id="db-port" type="number" value={form.port}
                           onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="db-db">Nome database</Label>
                    <Input id="db-db" value={form.db}
                           onChange={(e) => setForm({ ...form, db: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="db-user">Utente</Label>
                    <Input id="db-user" value={form.user}
                           onChange={(e) => setForm({ ...form, user: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-pw">
                    Password {target?.has_password && <span className="text-xs text-muted-foreground">(impostata)</span>}
                  </Label>
                  <Input id="db-pw" type="password" placeholder={target?.has_password ? "(invariata)" : ""}
                         value={form.password}
                         onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="outline" disabled={busy}>
                    <PlugZap className="h-4 w-4" /> Test connessione
                  </Button>
                  <Button type="button" variant="outline" onClick={prepareTarget} disabled={busy}>
                    <Wrench className="h-4 w-4" /> Prepara DB (crea schema)
                  </Button>
                  <Button type="button" onClick={switchTarget} disabled={busy}>
                    <ArrowRightLeft className="h-4 w-4" /> Salva e usa
                  </Button>
                </div>
                <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Lo switch è live solo per backend (HTTP). <strong>Worker e beat</strong> continuano col vecchio fino al restart container.</span>
                </p>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Tabelle ({s.tables.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {s.tables.map((t) => <code key={t} className="rounded bg-muted px-2 py-0.5">{t}</code>)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Viste ({s.views.length})</CardTitle></CardHeader>
              <CardContent>
                {s.views.length === 0
                  ? <p className="text-sm text-muted-foreground">Nessuna vista definita.</p>
                  : <div className="flex flex-wrap gap-1.5 text-xs">{s.views.map((v) => <code key={v} className="rounded bg-muted px-2 py-0.5">{v}</code>)}</div>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
