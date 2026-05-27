import Link from "next/link";
import { StatusBadge } from "./status-badge";

export type EventRow = {
  id: number; title: string; status: string;
  category_id: number | null; start_at: string; end_at: string;
};

const NEXT_ACTIONS: Record<string, { label: string; target: string; danger?: boolean }[]> = {
  draft: [{ label: "Pubblica", target: "published" }, { label: "Archivia", target: "archived" }],
  published: [{ label: "Sospendi", target: "suspended" }, { label: "Annulla", target: "cancelled", danger: true }, { label: "Archivia", target: "archived" }],
  suspended: [{ label: "Riattiva", target: "published" }, { label: "Annulla", target: "cancelled", danger: true }, { label: "Archivia", target: "archived" }],
  cancelled: [{ label: "Archivia", target: "archived" }],
  archived: [],
};

export function EventTable({
  items, onAction,
}: { items: EventRow[]; onAction: (id: number, kind: "transition" | "duplicate", target?: string) => void }) {
  return (
    <table className="w-full rounded border bg-white text-sm">
      <thead className="bg-gray-50 text-left">
        <tr><th className="p-3">Titolo</th><th className="p-3">Stato</th><th className="p-3">Inizio</th><th className="p-3">Azioni</th></tr>
      </thead>
      <tbody className="divide-y">
        {items.map((e) => (
          <tr key={e.id}>
            <td className="p-3"><Link className="text-blue-700 hover:underline" href={`/admin/events/${e.id}`}>{e.title}</Link></td>
            <td className="p-3"><StatusBadge status={e.status} /></td>
            <td className="p-3">{new Date(e.start_at).toLocaleString("it-IT")}</td>
            <td className="p-3 space-x-2">
              <button className="text-blue-700" onClick={() => onAction(e.id, "duplicate")}>Duplica</button>
              {(NEXT_ACTIONS[e.status] ?? []).map((a) => (
                <button
                  key={a.target}
                  className={a.danger ? "text-red-700" : "text-gray-700"}
                  onClick={() => {
                    if (a.danger && !window.confirm(`Confermi: ${a.label}?`)) return;
                    onAction(e.id, "transition", a.target);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
