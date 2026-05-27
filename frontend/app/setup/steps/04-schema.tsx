"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function Schema({ token, next }: { token: string; next: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tables, setTables] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  async function run() {
    setState("loading");
    try {
      const r = await setupApi.migrate(token);
      setTables(r.tables);
      setState("ok");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <p>Applica le migrazioni e crea lo schema sul database esterno.</p>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? "Creazione…" : "Crea schema"}
      </button>
      {state === "error" && <p className="text-red-700">Errore: {msg}</p>}
      {state === "ok" && (
        <>
          <p className="text-green-700">Schema creato: {tables.length} tabelle.</p>
          <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>Continua</button>
        </>
      )}
    </div>
  );
}
