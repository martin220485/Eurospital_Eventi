"use client";

import { useEffect, useState } from "react";
import { setupApi } from "@/lib/setup-api";

export function Done({ token }: { token: string; next: () => void }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setupApi.complete(token)
      .then(() => setState("ok"))
      .catch((e) => { setState("error"); setMsg((e as Error).message); });
  }, [token]);

  if (state === "loading") return <p>Finalizzazione…</p>;
  if (state === "error") return <p className="text-red-700">Errore: {msg}</p>;
  return (
    <div className="space-y-4">
      <p className="text-green-700">Setup completato! La piattaforma è pronta.</p>
      <a className="rounded bg-blue-600 px-4 py-2 text-white" href="/login">Vai al login</a>
    </div>
  );
}
