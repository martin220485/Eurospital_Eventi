"use client";

import { useState } from "react";
import { api } from "@/lib/admin-api";

type Result = { registration_id: number; username: string; event_title: string; status: string };
type LogEntry = { ok: boolean; text: string };

export function CheckinScanner() {
  const [token, setToken] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);

  async function submit() {
    if (!token.trim()) return;
    try {
      const res = await api.post<Result>("/checkin", { token: token.trim() });
      setLog((l) => [{ ok: true, text: `✓ ${res.username} — ${res.event_title} (${res.status})` }, ...l]);
    } catch (e) {
      setLog((l) => [{ ok: false, text: `✗ ${(e as Error).message}` }, ...l]);
    }
    setToken("");
  }

  return (
    <div className="max-w-lg space-y-3">
      <div className="flex gap-2">
        <input className="flex-1 rounded border p-2" placeholder="Token QR" value={token}
               onChange={(e) => setToken(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={submit}>Check-in</button>
      </div>
      <ul className="space-y-1 text-sm">
        {log.map((e, i) => (
          <li key={i} className={`rounded p-2 ${e.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{e.text}</li>
        ))}
      </ul>
    </div>
  );
}
