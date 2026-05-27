"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { eventSchema, type EventInput } from "@/lib/event-schemas";

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<Category[]>("/categories").then(setCats).catch(() => {}); }, []);

  function set<K extends keyof EventInput>(k: K, v: EventInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const parsed = eventSchema.safeParse(form);
    if (!parsed.success) { setError("Controlla i campi obbligatori (titolo, date)."); return; }
    setBusy(true); setError("");
    try { await onSubmit(parsed.data); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const inp = "w-full rounded border p-2";
  return (
    <div className="space-y-3">
      <input className={inp} placeholder="Titolo" value={form.title} onChange={(e) => set("title", e.target.value)} />
      <input className={inp} placeholder="Descrizione breve" value={form.short_description ?? ""} onChange={(e) => set("short_description", e.target.value)} />
      <textarea className={inp} rows={5} placeholder="Descrizione (HTML semplice)" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
      <div className="flex gap-2">
        <select className={inp} value={form.category_id ?? ""} onChange={(e) => set("category_id", e.target.value ? Number(e.target.value) : null)}>
          <option value="">Nessuna categoria</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={inp} value={form.mode} onChange={(e) => set("mode", e.target.value as EventInput["mode"])}>
          <option value="physical">In sede</option><option value="online">Online</option><option value="hybrid">Ibrido</option>
        </select>
      </div>
      <input className={inp} placeholder="Luogo" value={form.location_name ?? ""} onChange={(e) => set("location_name", e.target.value)} />
      <input className={inp} placeholder="Indirizzo" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      <input className={inp} placeholder="Link online" value={form.online_url ?? ""} onChange={(e) => set("online_url", e.target.value)} />
      <div className="flex gap-2">
        <label className="flex-1 text-sm">Inizio<input className={inp} type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} /></label>
        <label className="flex-1 text-sm">Fine<input className={inp} type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} /></label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1 text-sm">Capienza<input className={inp} type="number" value={form.capacity ?? ""} onChange={(e) => set("capacity", e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="flex-1 text-sm">Max per utente<input className={inp} type="number" value={form.max_per_user} onChange={(e) => set("max_per_user", Number(e.target.value))} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.waitlist_enabled} onChange={(e) => set("waitlist_enabled", e.target.checked)} /> Lista d&apos;attesa</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cancellation_allowed} onChange={(e) => set("cancellation_allowed", e.target.checked)} /> Annullamento consentito</label>
      <textarea className={inp} rows={2} placeholder="Note interne" value={form.internal_notes ?? ""} onChange={(e) => set("internal_notes", e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={submit}>Salva</button>
    </div>
  );
}
