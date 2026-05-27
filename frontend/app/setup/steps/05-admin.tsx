"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";
import { adminSchema } from "@/lib/setup-schemas";

export function AdminStep({ token, next }: { token: string; next: () => void }) {
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [error, setError] = useState("");

  async function submit() {
    const parsed = adminSchema.safeParse(form);
    if (!parsed.success) {
      setError("Controlla email, username (min 3) e password (min 8).");
      return;
    }
    try {
      await setupApi.createAdmin(token, parsed.data);
      next();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <p>Crea il primo amministratore (super_admin).</p>
      {(["email", "username", "password"] as const).map((f) => (
        <input
          key={f}
          className="w-full rounded border p-2"
          type={f === "password" ? "password" : "text"}
          placeholder={f}
          value={form[f]}
          onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        />
      ))}
      {error && <p className="text-red-700">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={submit}>Crea admin</button>
    </div>
  );
}
