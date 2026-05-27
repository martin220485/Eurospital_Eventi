"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function PlatformStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({
    name: "Eurospital Eventi", primary_color: "#0a66c2", language: "it", timezone: "Europe/Rome",
  });
  const [msg, setMsg] = useState("");

  async function save() {
    try { await setupApi.savePlatform(token, form); next(); }
    catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <p>Configurazione base della piattaforma (opzionale).</p>
      {(["name", "primary_color", "language", "timezone"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {msg && <p className="text-red-700">{msg}</p>}
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva</button>
        <button className="rounded border px-4 py-2" onClick={next}>Usa default</button>
      </div>
    </div>
  );
}
