"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { api } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

type Category = { id: number; name: string; color: string; description?: string | null };

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", color: "#3a7fb3", description: "" });
  const [editing, setEditing] = useState<Category | null>(null);

  async function load() {
    setError("");
    try { setCats(await api.get<Category[]>("/categories")); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.post("/categories", { ...form, description: form.description || null });
      setForm({ name: "", color: "#3a7fb3", description: "" });
      toast.success("Categoria creata");
      await load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    try {
      await api.put(`/categories/${editing.id}`, {
        name: editing.name,
        color: editing.color,
        description: editing.description || null,
      });
      toast.success("Categoria aggiornata");
      setEditing(null);
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
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label htmlFor="cat-desc">Descrizione (opzionale)</Label>
              <Input id="cat-desc" placeholder="Breve descrizione"
                     value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Impossibile caricare le categorie. {error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RotateCw className="h-4 w-4" /> Riprova
            </Button>
          </CardContent>
        </Card>
      ) : cats === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="px-0">
            {cats.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Nessuna categoria.</p>
            ) : (
              <ul className="divide-y">
                {cats.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-6 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="inline-block h-5 w-5 shrink-0 rounded border" style={{ background: c.color }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        {c.description && (
                          <span className="block truncate text-xs text-muted-foreground">{c.description}</span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing({ ...c })}>
                        <Pencil className="h-4 w-4" /> Modifica
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4" /> Elimina
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica categoria</DialogTitle>
          </DialogHeader>
          {editing && (
            <form id="cat-edit" onSubmit={saveEdit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nome</Label>
                <Input id="edit-name" value={editing.name}
                       onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Descrizione (opzionale)</Label>
                <Input id="edit-desc" value={editing.description ?? ""}
                       onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-color">Colore</Label>
                <Input id="edit-color" type="color" className="h-9 w-16 cursor-pointer p-1"
                       value={editing.color}
                       onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button type="submit" form="cat-edit">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
