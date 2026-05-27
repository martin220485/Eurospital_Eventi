"use client";

export function Summary({ next }: { token: string; next: () => void }) {
  return (
    <div className="space-y-4">
      <p>Hai completato i passaggi di configurazione. Premi per finalizzare il setup.</p>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={next}>Vai al completamento</button>
    </div>
  );
}
