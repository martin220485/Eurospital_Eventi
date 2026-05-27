"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function AdStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({ server_uri: "", base_dn: "", bind_dn: "", bind_pw: "" });
  const [msg, setMsg] = useState("");

  async function save() {
    try { await setupApi.saveAd(token, { ...form, attr_mapping: {} }); next(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function test() {
    try {
      const r = await setupApi.testAd(token, {
        server_uri: form.server_uri, bind_dn: form.bind_dn, bind_pw: form.bind_pw,
      });
      setMsg(r.ok ? "Bind LDAP riuscito." : `Errore: ${r.error}`);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <p>Configura Active Directory / LDAP (opzionale).</p>
      {(["server_uri", "base_dn", "bind_dn", "bind_pw"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          type={f === "bind_pw" ? "password" : "text"}
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <div className="flex gap-2">
        <button className="rounded border px-4 py-2" onClick={test}>Testa bind</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva</button>
        <button className="rounded border px-4 py-2" onClick={next}>Configura dopo</button>
      </div>
    </div>
  );
}
