"use client";

import { useEffect, useState } from "react";
import { Mail, Save, Send } from "lucide-react";
import { smtpApi, type SmtpSettings } from "@/lib/admin-extra-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

type SmtpForm = SmtpSettings & { password: string };

export default function SmtpSettingsPage() {
  const [s, setS] = useState<SmtpForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    smtpApi.getSettings()
      .then((d) => setS({ ...d, password: "" }))
      .catch((e) => toast.error((e as Error).message));
  }, []);

  if (!s) return <p>Caricamento…</p>;

  function set<K extends keyof SmtpForm>(k: K, v: SmtpForm[K]) {
    setS((curr) => (curr ? { ...curr, [k]: v } : curr));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const cur = s;
    setBusy(true);
    try {
      const body: Partial<SmtpSettings> & { password?: string } = {
        host: cur.host, port: cur.port, tls_mode: cur.tls_mode,
        from_address: cur.from_address, from_name: cur.from_name,
        username: cur.username,
      };
      if (cur.password) body.password = cur.password;
      const saved = await smtpApi.saveSettings(body);
      setS({ ...saved, password: "" });
      toast.success("SMTP salvato");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function test() {
    if (!s) return;
    const cur = s;
    if (!cur.host || !cur.port || !cur.from_address) {
      toast.error("Compila host, porta e mittente");
      return;
    }
    setBusy(true);
    try {
      const res = await smtpApi.test({
        host: cur.host, port: cur.port, tls_mode: cur.tls_mode,
        username: cur.username, password: cur.password || null,
        from_address: cur.from_address,
      });
      if (res.ok) toast.success("SMTP OK + email di test inviata");
      else toast.error(`Test fallito: ${res.error}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>SMTP</h1>
        <p className="text-sm text-muted-foreground">Configurazione server email per notifiche</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-brand-600" /> Configurazione server
          </CardTitle>
          <CardDescription>Password cifrata at-rest con Fernet. Lascia vuota per mantenere quella esistente.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="host">Host</Label>
                <Input id="host" placeholder="smtp.aziendale.it" value={s.host ?? ""}
                       onChange={(e) => set("host", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port">Porta</Label>
                <Input id="port" type="number" placeholder="587" value={s.port ?? ""}
                       onChange={(e) => set("port", e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>TLS</Label>
              <Select value={s.tls_mode} onValueChange={(v) => set("tls_mode", v)}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starttls">STARTTLS (porta 587, consigliato)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (porta 465)</SelectItem>
                  <SelectItem value="none">Nessuno (porta 25, sconsigliato)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from-addr">Mittente</Label>
                <Input id="from-addr" type="email" placeholder="eventi@eurospital.it"
                       value={s.from_address ?? ""}
                       onChange={(e) => set("from_address", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-name">Nome mittente</Label>
                <Input id="from-name" placeholder="Eurospital Eventi" value={s.from_name ?? ""}
                       onChange={(e) => set("from_name", e.target.value || null)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user">Username</Label>
                <Input id="user" value={s.username ?? ""}
                       onChange={(e) => set("username", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">
                  Password {s.has_password && <span className="text-xs text-muted-foreground">(impostata)</span>}
                </Label>
                <Input id="pw" type="password" placeholder={s.has_password ? "(invariata)" : ""}
                       value={s.password}
                       onChange={(e) => set("password", e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={test} disabled={busy}>
                <Send className="h-4 w-4" /> Invia email di test
              </Button>
              <Button type="submit" disabled={busy}>
                <Save className="h-4 w-4" /> Salva
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
