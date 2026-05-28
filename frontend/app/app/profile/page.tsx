"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, KeyRound, LayoutDashboard, Mail, RotateCw, User as UserIcon } from "lucide-react";
import { api } from "@/lib/admin-api";
import { changePasswordSchema } from "@/lib/catalog-schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

type Me = { username: string; email: string; full_name?: string; permissions?: string[] };

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
  const [form, setForm] = useState({ old_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);

  function loadMe() {
    setMeError("");
    api.get<Me>("/auth/me").then(setMe).catch((e) => setMeError((e as Error).message));
  }
  useEffect(() => { loadMe(); }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse(form);
    if (!parsed.success) {
      toast.error("La nuova password deve avere almeno 8 caratteri");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", form);
      toast.success("Password aggiornata");
      setForm({ old_password: "", new_password: "" });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Profilo</h1>
          <p className="text-sm text-muted-foreground">Dati personali e impostazioni</p>
        </div>
        {me?.permissions && me.permissions.length > 0 && (
          <Button variant="outline" asChild>
            <Link href="/admin">
              <LayoutDashboard className="h-4 w-4" /> Vai al Backoffice
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informazioni personali</CardTitle>
          <CardDescription>Dati sincronizzati dall&apos;anagrafica aziendale</CardDescription>
        </CardHeader>
        <CardContent>
          {meError ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">Impossibile caricare il profilo. {meError}</p>
              <Button variant="outline" size="sm" onClick={loadMe}>
                <RotateCw className="h-4 w-4" /> Riprova
              </Button>
            </div>
          ) : !me ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserIcon className="h-3 w-3" /> Nome</dt>
                <dd className="mt-0.5 font-medium">{me.full_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Username</dt>
                <dd className="mt-0.5 font-medium">{me.username}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> Email</dt>
                <dd className="mt-0.5 font-medium">{me.email}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-brand-600" />
            Cambia password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="old_pw">Vecchia password</Label>
              <Input id="old_pw" type="password" value={form.old_password}
                     onChange={(e) => setForm({ ...form, old_password: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_pw">Nuova password (min 8)</Label>
              <Input id="new_pw" type="password" value={form.new_password}
                     onChange={(e) => setForm({ ...form, new_password: e.target.value })} required minLength={8} />
            </div>
            <div className="sm:col-span-2">
              <Button disabled={busy}>{busy ? "Aggiornamento…" : "Aggiorna password"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">I miei dati (GDPR)</CardTitle>
          <CardDescription>
            Scarica una copia di tutti i dati che la piattaforma conserva su di te
            (profilo, iscrizioni, notifiche, audit log).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/api/me/data-export">
              <Download className="h-4 w-4" /> Esporta i miei dati (JSON)
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
