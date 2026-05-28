"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, resolveLanding } from "@/lib/admin-api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    <div className="mx-auto mt-24 max-w-sm rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">Accedi</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full rounded border p-2"
          placeholder="Email o username"
          value={form.identifier}
          onChange={(e) => setForm({ ...form, identifier: e.target.value })}
        />
        <input
          className="w-full rounded border p-2"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Accesso…" : "Accedi"}
        </button>
      </form>
    </div>
  );
}
