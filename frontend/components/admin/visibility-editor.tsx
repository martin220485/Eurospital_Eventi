"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

export function VisibilityEditor({ eventId }: { eventId: number }) {
  const [mode, setMode] = useState<"all" | "restricted">("all");
  const [groups, setGroups] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<{ mode: "all" | "restricted"; groups: string[] }>(`/events/${eventId}/visibility`)
      .then((v) => { setMode(v.mode); setGroups(v.groups); }).catch(() => {});
  }, [eventId]);

  async function save() {
    await api.put(`/events/${eventId}/visibility`, { mode, groups });
    setMsg("Visibilità salvata.");
  }

  return (
    <div className="space-y-3">
      <select className="rounded border p-2" value={mode} onChange={(e) => setMode(e.target.value as "all" | "restricted")}>
        <option value="all">Tutti</option>
        <option value="restricted">Reparti/gruppi specifici</option>
      </select>
      {mode === "restricted" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="rounded border p-2" placeholder="Reparto o gruppo" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="rounded border px-3" onClick={() => { if (draft) { setGroups([...groups, draft]); setDraft(""); } }}>Aggiungi</button>
          </div>
          <ul className="text-sm">
            {groups.map((g, i) => (
              <li key={i} className="flex justify-between border-b py-1">
                {g}<button className="text-red-700" onClick={() => setGroups(groups.filter((_, idx) => idx !== i))}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={save}>Salva visibilità</button>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
    </div>
  );
}
