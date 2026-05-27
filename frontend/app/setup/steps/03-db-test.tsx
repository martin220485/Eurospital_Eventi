"use client";

import { useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function DbTest({ token, next }: { token: string; next: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setState("loading");
    try {
      const r = await setupApi.dbTest(token);
      if (r.ok) setState("ok");
      else { setState("error"); setMsg(r.error ?? "Errore sconosciuto"); }
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? "Test in corso…" : "Testa connessione"}
      </button>
      {state === "ok" && <p className="text-green-700">Connessione riuscita.</p>}
      {state === "error" && <p className="text-red-700">Errore: {msg}</p>}
      {state === "ok" && (
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>Continua</button>
      )}
    </div>
  );
}
