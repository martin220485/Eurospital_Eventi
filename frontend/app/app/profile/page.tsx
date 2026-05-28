"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";
import { changePasswordSchema } from "@/lib/catalog-schemas";

type Me = { username: string; email: string; full_name?: string };

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState({ old_password: "", new_password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { api.get<Me>("/auth/me").then(setMe).catch(() => {}); }, []);

  async function changePassword() {
    setMsg(""); setErr("");
    const parsed = changePasswordSchema.safeParse(form);
    if (!parsed.success) { setErr("La nuova password deve avere almeno 8 caratteri."); return; }
    try {
      await api.post("/auth/change-password", form);
      setMsg("Password aggiornata.");
      setForm({ old_password: "", new_password: "" });
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Profilo</h1>
      <section className="rounded border bg-white p-4 text-sm">
        <p><span className="text-gray-500">Nome:</span> {me?.full_name ?? "—"}</p>
        <p><span className="text-gray-500">Username:</span> {me?.username ?? "—"}</p>
        <p><span className="text-gray-500">Email:</span> {me?.email ?? "—"}</p>
      </section>
      <section className="rounded border bg-white p-4 space-y-2">
        <h2 className="font-medium">Cambia password</h2>
        <input className="w-full rounded border p-2" type="password" placeholder="Vecchia password"
               value={form.old_password} onChange={(e) => setForm({ ...form, old_password: e.target.value })} />
        <input className="w-full rounded border p-2" type="password" placeholder="Nuova password (min 8)"
               value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        {err && <p className="text-sm text-red-700">{err}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={changePassword}>Aggiorna password</button>
      </section>
      <section className="rounded border bg-white p-4 space-y-2">
        <h2 className="font-medium">I miei dati (GDPR)</h2>
        <p className="text-sm text-gray-600">
          Scarica una copia di tutti i dati che la piattaforma conserva su di te
          (profilo, iscrizioni, notifiche, audit log).
        </p>
        <a className="inline-block rounded bg-blue-600 px-4 py-2 text-sm text-white"
           href="/api/me/data-export">Esporta i miei dati (JSON)</a>
      </section>
    </div>
  );
}
