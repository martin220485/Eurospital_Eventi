"use client";

import { useState } from "react";
import { auditApi, type AuditLogItem } from "@/lib/audit-api";

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
      <div className="flex gap-2">
        <input
          aria-label="azione"
          placeholder="es. auth.login.fail"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <button onClick={reload} disabled={busy} className="rounded border px-3 py-1 text-sm">
          {busy ? "…" : "Filtra"}
        </button>
        <span className="ml-auto text-sm text-gray-500">{total} totali</span>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Data</th>
            <th className="p-2">Azione</th>
            <th className="p-2">Actor</th>
            <th className="p-2">Target</th>
            <th className="p-2">IP</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="p-2">{new Date(r.created_at).toLocaleString("it-IT")}</td>
              <td className="p-2"><code className="text-xs">{r.action}</code></td>
              <td className="p-2">{r.actor_id ?? "—"}</td>
              <td className="p-2">{r.target_type ? `${r.target_type}#${r.target_id}` : "—"}</td>
              <td className="p-2">{r.ip || "—"}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-gray-500">Nessuna voce.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
