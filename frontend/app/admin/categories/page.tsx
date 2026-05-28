"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";

type Category = { id: number; name: string; color: string; description?: string };

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", color: "#3a7fb3" });

  async function load() {
    try { setCats(await api.get<Category[]>("/categories")); }
    catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.post("/categories", form);
      setForm({ name: "", color: "#3a7fb3" });
      toast.success("Categoria creata");
      await load();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(id: number) {
    if (!window.confirm("Eliminare la categoria?")) return;
    try { await api.del(`/categories/${id}`); toast.success("Eliminata"); await load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Categorie</h1>
        <p className="text-sm text-muted-foreground">Etichette colorate per organizzare gli eventi</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nome</Label>
              <Input id="cat-name" placeholder="Es. Formazione"
                     value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-color">Colore</Label>
              <Input id="cat-color" type="color" className="h-9 w-16 cursor-pointer p-1"
                     value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <Button type="submit"><Plus className="h-4 w-4" /> Aggiungi</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          {cats.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Nessuna categoria.</p>
          ) : (
            <ul className="divide-y">
              {cats.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-6 py-3">
                  <span className="flex items-center gap-3">
                    <span className="inline-block h-5 w-5 rounded shadow" style={{ background: c.color }} />
                    <span className="font-medium">{c.name}</span>
                  </span>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4" /> Elimina
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
