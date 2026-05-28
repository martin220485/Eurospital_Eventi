"use client";

import { useState } from "react";
import { notificationsApi, type LogOut } from "@/lib/notifications-api";

export function LogTable({ initialItems, initialTotal }: { initialItems: LogOut[]; initialTotal: number }) {
  const [items, setItems] = useState<LogOut[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState<number | null>(null);

  async function reload() {
    setBusy(true);
    try {
      const data = await notificationsApi.listLogs({
        status_filter: status || undefined,
        template: template || undefined,
        limit: 50, offset: 0,
      });
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setBusy(false);
    }
  }

  async function resend(id: number) {
    setResending(id);
    try {
      await notificationsApi.resend(id);
    } finally {
      setResending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          aria-label="Stato"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">Tutti gli stati</option>
          <option value="sent">Inviati</option>
          <option value="failed">Falliti</option>
          <option value="pending">In coda</option>
        </select>
        <input
          aria-label="Template"
          placeholder="codice template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <button onClick={reload} disabled={busy} className="rounded border px-3 py-1 text-sm">
          {busy ? "…" : "Filtra"}
        </button>
        <span className="ml-auto text-sm text-gray-500">{total} totale</span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Data</th>
            <th className="p-2">Template</th>
            <th className="p-2">Destinatario</th>
            <th className="p-2">Stato</th>
            <th className="p-2">Tentativi</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="p-2">{new Date(r.created_at).toLocaleString("it-IT")}</td>
              <td className="p-2"><code className="text-xs">{r.template_code}</code></td>
              <td className="p-2">{r.to_address}</td>
              <td className="p-2">
                <span className={
                  r.status === "sent" ? "rounded bg-green-100 px-2 py-1 text-xs text-green-800" :
                  r.status === "failed" ? "rounded bg-red-100 px-2 py-1 text-xs text-red-800" :
                  "rounded bg-gray-100 px-2 py-1 text-xs"
                }>{r.status}</span>
              </td>
              <td className="p-2">{r.attempts}</td>
              <td className="p-2">
                <button
                  onClick={() => resend(r.id)}
                  disabled={resending === r.id}
                  className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                >
                  {resending === r.id ? "…" : "Rinvia"}
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="p-4 text-center text-gray-500">Nessun log.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
