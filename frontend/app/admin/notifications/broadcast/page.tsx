"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { broadcastApi, usersApi } from "@/lib/admin-extra-api";
import { notificationsApi, type TemplateOut } from "@/lib/notifications-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

export default function BroadcastPage() {
  const [templates, setTemplates] = useState<TemplateOut[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [form, setForm] = useState({
    template_code: "",
    target: "all" as "all" | "event" | "role",
    event_id: "",
    event_status: "",
    role_name: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    notificationsApi.listTemplates().then(setTemplates).catch(() => {});
    usersApi.listRoles().then(setRoles).catch(() => {});
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!form.template_code) { toast.error("Seleziona un template"); return; }
    setBusy(true);
    try {
      const body: Parameters<typeof broadcastApi.send>[0] = {
        template_code: form.template_code, target: form.target,
      };
      if (form.target === "event") {
        if (!form.event_id) throw new Error("event_id mancante");
        body.event_id = Number(form.event_id);
        if (form.event_status) body.event_status = form.event_status;
      } else if (form.target === "role") {
        if (!form.role_name) throw new Error("role_name mancante");
        body.role_name = form.role_name;
      }
      const res = await broadcastApi.send(body);
      toast.success(`Accodate ${res.queued} email`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Broadcast notifiche</h1>
        <p className="text-sm text-muted-foreground">Invia una comunicazione email mirata</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Componi invio</CardTitle>
          <CardDescription>Il rendering del template usa un contesto generico</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={send} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={form.template_code} onValueChange={(v) => setForm({ ...form, template_code: v })}>
                <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.code} value={t.code}>{t.name} ({t.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatari</Label>
              <Select value={form.target} onValueChange={(v) => setForm({ ...form, target: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli utenti attivi</SelectItem>
                  <SelectItem value="event">Iscritti ad un evento</SelectItem>
                  <SelectItem value="role">Membri di un ruolo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.target === "event" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-id">ID Evento</Label>
                  <Input id="ev-id" type="number" value={form.event_id}
                         onChange={(e) => setForm({ ...form, event_id: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Filtra per stato iscrizione</Label>
                  <Select value={form.event_status || "any"} onValueChange={(v) => setForm({ ...form, event_status: v === "any" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Tutti</SelectItem>
                      <SelectItem value="confirmed">Confermati</SelectItem>
                      <SelectItem value="waitlisted">In lista d&apos;attesa</SelectItem>
                      <SelectItem value="attended">Presenti</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {form.target === "role" && (
              <div className="space-y-1.5">
                <Label>Ruolo</Label>
                <Select value={form.role_name} onValueChange={(v) => setForm({ ...form, role_name: v })}>
                  <SelectTrigger><SelectValue placeholder="Scegli ruolo…" /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="submit" disabled={busy}>
              <Send className="h-4 w-4" /> {busy ? "Invio…" : "Invia"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
