"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Lock, User } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { login, resolveLanding } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Hints = { sso_enabled: boolean; directory_label: string | null };

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<Hints>({ sso_enabled: false, directory_label: null });

  useEffect(() => {
    fetch("/api/auth/hints", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: Hints | null) => { if (d) setHints(d); })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.identifier, form.password);
      router.push(await resolveLanding());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <BrandLogo className="mx-auto !h-12 !w-12 !rounded-lg" />
          <div>
            <CardTitle className="text-2xl text-brand-800">Eurospital Eventi</CardTitle>
            <CardDescription>Accedi al portale aziendale</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {hints.sso_enabled && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Single Sign-On attivo.</strong> Accedi con le credenziali della tua{" "}
                {hints.directory_label ?? "directory aziendale"}.
                Gli admin di emergenza possono usare il login locale.
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="identifier">{hints.sso_enabled ? "Username AD / email" : "Email o username"}</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="identifier"
                  className="pl-8"
                  placeholder="nome.cognome"
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  className="pl-8"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button className="w-full" disabled={busy}>
              {busy ? "Accesso in corso…" : "Accedi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
