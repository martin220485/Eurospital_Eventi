"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { auditApi } from "@/lib/audit-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";

export function AnonymizeUser() {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const id = Number(userId);
    if (!id) return;
    if (!window.confirm(`Anonimizzare permanentemente utente #${id}? Operazione irreversibile.`)) return;
    setBusy(true);
    try {
      const res = await auditApi.anonymizeUser(id);
      toast.success(`Utente #${res.user_id} anonimizzato`);
      setUserId("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <Trash2 className="h-4 w-4" /> Anonimizza utente (GDPR Art. 17)
        </CardTitle>
        <CardDescription>
          Rimuove PII dall&apos;utente; iscrizioni e audit log restano per integrità referenziale.
          Operazione irreversibile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="uid">ID utente</Label>
            <Input id="uid" placeholder="123" value={userId}
                   onChange={(e) => setUserId(e.target.value)} type="number" className="w-32" />
          </div>
          <Button variant="destructive" onClick={submit} disabled={busy || !userId}>
            {busy ? "…" : "Anonimizza"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
