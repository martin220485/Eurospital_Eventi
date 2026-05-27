"use client";

export function Welcome({
  token, setToken, next,
}: { token: string; setToken: (v: string) => void; next: () => void }) {
  return (
    <div className="space-y-4">
      <p>Benvenuto nella configurazione di Eurospital Eventi. Inserisci il token di setup mostrato nei log del backend all&apos;avvio.</p>
      <input
        className="w-full rounded border p-2"
        placeholder="SETUP_TOKEN"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <button
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={!token}
        onClick={next}
      >
        Continua
      </button>
    </div>
  );
}
