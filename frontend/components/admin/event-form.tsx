"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { eventSchema, type EventInput } from "@/lib/event-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

type Category = { id: number; name: string };

const EMPTY: EventInput = {
  title: "", short_description: "", description: "", category_id: null,
  mode: "physical", location_name: "", address: "", online_url: "",
  start_at: "", end_at: "", waitlist_enabled: false, max_per_user: 1,
  cancellation_allowed: true, internal_notes: "",
};

export function EventForm({
  initial, onSubmit,
}: { initial?: Partial<EventInput>; onSubmit: (data: EventInput) => Promise<void> }) {
  const [form, setForm] = useState<EventInput>({ ...EMPTY, ...initial });
  const [cats, setCats] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<Category[]>("/categories").then(setCats).catch(() => {}); }, []);

  function set<K extends keyof EventInput>(k: K, v: EventInput[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Auto-imposta end_at = start_at + 1h se end_at è vuoto o <= start_at
      if (k === "start_at" && typeof v === "string" && v) {
        if (!next.end_at || next.end_at <= v) {
          const d = new Date(v);
          if (!isNaN(d.getTime())) {
            d.setHours(d.getHours() + 1);
            const iso = d.toISOString().slice(0, 16);
            next.end_at = iso;
          }
        }
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = eventSchema.safeParse(form);
    if (!parsed.success) { toast.error("Controlla i campi obbligatori (titolo, date)"); return; }
    if (form.end_at && form.start_at && form.end_at <= form.start_at) {
      toast.error("La data/ora di fine deve essere successiva a quella di inizio");
      return;
    }
    setBusy(true);
    try { await onSubmit(parsed.data); toast.success("Salvato"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="ev-title">Titolo *</Label>
        <Input id="ev-title" value={form.title} onChange={(e) => set("title", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-short">Descrizione breve</Label>
        <Textarea id="ev-short" rows={2} value={form.short_description ?? ""}
                  onChange={(e) => set("short_description", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Descrizione</Label>
        <RichTextEditor value={form.description ?? ""} onChange={(html) => set("description", html)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={form.category_id?.toString() ?? "none"} onValueChange={(v) => set("category_id", v === "none" ? null : Number(v))}>
            <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessuna categoria</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Modalità</Label>
          <Select value={form.mode} onValueChange={(v) => set("mode", v as EventInput["mode"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="physical">In sede</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="hybrid">Ibrido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-loc">Luogo</Label>
          <Input id="ev-loc" value={form.location_name ?? ""} onChange={(e) => set("location_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-addr">Indirizzo</Label>
          <Input id="ev-addr" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-url">Link online</Label>
          <Input id="ev-url" value={form.online_url ?? ""} onChange={(e) => set("online_url", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev-start">Inizio *</Label>
          <Input id="ev-start" type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-end">Fine *</Label>
          <Input id="ev-end" type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} required />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev-cap">Capienza</Label>
          <Input id="ev-cap" type="number" value={form.capacity ?? ""}
                 onChange={(e) => set("capacity", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-max">Max per utente</Label>
          <Input id="ev-max" type="number" value={form.max_per_user}
                 onChange={(e) => set("max_per_user", Number(e.target.value))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-6 rounded-md bg-muted/30 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.waitlist_enabled}
                 onChange={(e) => set("waitlist_enabled", e.target.checked)} />
          Lista d&apos;attesa
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.cancellation_allowed}
                 onChange={(e) => set("cancellation_allowed", e.target.checked)} />
          Annullamento consentito
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-notes">Note interne</Label>
        <Textarea id="ev-notes" rows={2} value={form.internal_notes ?? ""}
                  onChange={(e) => set("internal_notes", e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Salvataggio…" : "Salva evento"}
        </Button>
      </div>
    </form>
  );
}
