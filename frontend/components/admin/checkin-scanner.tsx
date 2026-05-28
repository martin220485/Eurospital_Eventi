"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ScanLine, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Result = { registration_id: number; username: string; event_title: string; status: string };
type LogEntry = { ok: boolean; user?: string; event?: string; status?: string; message?: string; key: number };

export function CheckinScanner() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const okCount = log.filter((e) => e.ok).length;

  async function submit() {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.post<Result>("/checkin", { token: token.trim() });
      setLog((l) => [
        { ok: true, user: res.username, event: res.event_title, status: res.status, key: nextKey.current++ },
        ...l,
      ]);
    } catch (e) {
      setLog((l) => [{ ok: false, message: (e as Error).message, key: nextKey.current++ }, ...l]);
    } finally {
      setBusy(false);
      setToken("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                autoFocus
                className="pl-8"
                placeholder="Token QR"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                aria-label="Token QR partecipante"
              />
            </div>
            <Button onClick={submit} disabled={busy || !token.trim()}>
              {busy ? "Verifica…" : "Check-in"}
            </Button>
          </div>
          {log.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span aria-live="polite">{okCount} check-in in questa sessione</span>
              <button
                type="button"
                onClick={() => setLog([])}
                className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="h-3.5 w-3.5" /> Pulisci
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <ul className="space-y-2" aria-live="polite">
        {log.map((e) => (
          <li
            key={e.key}
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              e.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
            }`}
          >
            {e.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            )}
            {e.ok ? (
              <span className="text-emerald-900">
                <span className="font-medium">{e.user}</span> — {e.event}{" "}
                <span className="text-emerald-700">({e.status})</span>
              </span>
            ) : (
              <span className="text-red-900">{e.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
