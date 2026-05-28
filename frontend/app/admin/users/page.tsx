"use client";

import { useEffect, useState } from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import { usersApi, type UserItem } from "@/lib/admin-extra-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";

export default function UsersPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [q, setQ] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", username: "", password: "", full_name: "", department: "", role: "" });

  async function load() {
    try { setItems((await usersApi.list({ q: q || undefined })).items); }
    catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); usersApi.listRoles().then(setRoles).catch(() => {}); /* eslint-disable-next-line */ }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await usersApi.create({
        ...form,
        full_name: form.full_name || undefined,
        department: form.department || undefined,
        role: form.role || undefined,
      });
      toast.success("Utente creato");
      setOpen(false);
      setForm({ email: "", username: "", password: "", full_name: "", department: "", role: "" });
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function toggleActive(u: UserItem) {
    try {
      await usersApi.update(u.id, { is_active: !u.is_active });
      toast.success(u.is_active ? "Disattivato" : "Riattivato");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1>Utenti</h1>
          <p className="text-sm text-muted-foreground">Anagrafica, ruoli, attivazione</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4" /> Nuovo utente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea utente locale</DialogTitle>
            </DialogHeader>
            <form id="ucreate" onSubmit={create} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cu-email">Email</Label>
                  <Input id="cu-email" type="email" required value={form.email}
                         onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cu-username">Username</Label>
                  <Input id="cu-username" required value={form.username}
                         onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-pw">Password (min 8)</Label>
                <Input id="cu-pw" type="password" required minLength={8} value={form.password}
                       onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cu-name">Nome completo</Label>
                  <Input id="cu-name" value={form.full_name}
                         onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cu-dept">Reparto</Label>
                  <Input id="cu-dept" value={form.department}
                         onChange={(e) => setForm({ ...form, department: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Ruolo iniziale (opzionale)</Label>
                <Select value={form.role || "none"} onValueChange={(v) => setForm({ ...form, role: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </form>
            <DialogFooter>
              <Button type="submit" form="ucreate"><Plus className="h-4 w-4" /> Crea</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cerca email/username/nome…" value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        </div>
        <Button variant="outline" onClick={load}>Cerca</Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utente</TableHead>
              <TableHead>Reparto</TableHead>
              <TableHead>Auth</TableHead>
              <TableHead>Ruoli</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nessun utente.</TableCell></TableRow>
            ) : items.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.full_name || u.username}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.department || "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.auth_source === "ldap" ? "default" : u.auth_source === "anonymized" ? "destructive" : "secondary"}>
                    {u.auth_source}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{u.roles.join(", ") || "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? "success" : "secondary"}>{u.is_active ? "Attivo" : "Disattivato"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                    {u.is_active ? "Disattiva" : "Riattiva"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
