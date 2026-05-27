"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

type Category = { id: number; name: string; color: string; description?: string };

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", color: "#0a66c2" });
  const [error, setError] = useState("");

  async function load() {
    setCats(await api.get<Category[]>("/categories"));
  }
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  async function create() {
    try {
      await api.post("/categories", form);
      setForm({ name: "", color: "#0a66c2" });
      await load();
    } catch (e) { setError((e as Error).message); }
  }
  async function remove(id: number) {
    try { await api.del(`/categories/${id}`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Categorie</h1>
      <div className="flex gap-2">
        <input className="rounded border p-2" placeholder="Nome"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="h-10 w-14 rounded border" type="color"
               value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={create}>Aggiungi</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y rounded border bg-white">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded" style={{ background: c.color }} />
              {c.name}
            </span>
            <button className="text-sm text-red-700" onClick={() => remove(c.id)}>Elimina</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
