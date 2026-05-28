"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { auditApi, type AuditLogItem } from "@/lib/audit-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TONE: Record<string, "success" | "warning" | "destructive" | "default" | "secondary"> = {
  "auth.login.success": "success",
  "auth.login.fail": "destructive",
  "auth.refresh": "secondary",
  "auth.refresh.fail": "destructive",
  "auth.logout": "secondary",
  "user.anonymize": "warning",
};

export function AuditLogTable({
  initialItems, initialTotal,
}: { initialItems: AuditLogItem[]; initialTotal: number }) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setBusy(true);
    try {
      const data = await auditApi.list({ action: action || undefined, limit: 100 });
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filtra per azione (es. auth.login.fail)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") reload(); }}
          />
        </div>
        <Button variant="outline" onClick={reload} disabled={busy}>
          {busy ? "…" : "Applica"}
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{total} totali</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Azione</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nessuna voce.</TableCell>
            </TableRow>
          ) : items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(r.created_at).toLocaleString("it-IT")}
              </TableCell>
              <TableCell>
                <Badge variant={TONE[r.action] ?? "secondary"}>{r.action}</Badge>
              </TableCell>
              <TableCell>{r.actor_id ?? "—"}</TableCell>
              <TableCell>{r.target_type ? `${r.target_type}#${r.target_id}` : "—"}</TableCell>
              <TableCell className="font-mono text-xs">{r.ip || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
