"use client";

export function DbConfig({ next }: { token: string; next: () => void }) {
  return (
    <div className="space-y-4">
      <p>La connessione al MySQL esterno usa le credenziali da <code>.env</code> (host, porta, database, utente). Nel prossimo passo testiamo la connessione.</p>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>
        Vai al test
      </button>
    </div>
  );
}
