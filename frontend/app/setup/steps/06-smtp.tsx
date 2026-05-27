"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function SmtpStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({ host: "", port: "587", from_address: "", password: "" });
  const [msg, setMsg] = useState("");

  async function save() {
    try {
      await setupApi.saveSmtp(token, { ...form, port: Number(form.port) });
      next();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function test() {
    try {
      const r = await setupApi.testSmtp(token, { ...form, port: Number(form.port) });
      setMsg(r.ok ? "Email di test inviata." : `Errore: ${r.error}`);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <p>Configura SMTP (opzionale).</p>
      {(["host", "port", "from_address", "password"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          type={f === "password" ? "password" : "text"}
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <div className="flex gap-2">
        <button className="rounded border px-4 py-2" onClick={test}>Invia test</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva</button>
        <button className="rounded border px-4 py-2" onClick={next}>Configura dopo</button>
      </div>
    </div>
  );
}
