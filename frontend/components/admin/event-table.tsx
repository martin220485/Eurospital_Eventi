import Link from "next/link";
import { Copy, Trash2 } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
}: {
  items: EventRow[];
  onAction: (id: number, kind: "transition" | "duplicate" | "delete", target?: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titolo</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Inizio</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                Nessun evento. Crea il primo evento per iniziare.
              </TableCell>
            </TableRow>
          ) : items.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <Link href={`/admin/events/${e.id}`} className="font-medium text-brand-700 hover:underline">
                  {e.title}
                </Link>
              </TableCell>
              <TableCell><StatusBadge status={e.status} /></TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(e.start_at).toLocaleString("it-IT", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onAction(e.id, "duplicate")}>
                    <Copy className="h-3.5 w-3.5" /> Duplica
                  </Button>
                  <Button size="sm" variant="ghost"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (!window.confirm("Eliminare l'evento?\n\nSe non ci sono iscritti viene cancellato definitivamente.\nSe ci sono iscritti l'eliminazione fallisce: usa 'Annulla' per notificarli.")) return;
                            onAction(e.id, "delete");
                          }}>
                    <Trash2 className="h-3.5 w-3.5" /> Elimina
                  </Button>
                  {(NEXT_ACTIONS[e.status] ?? []).map((a) => (
                    <Button
                      key={a.target}
                      size="sm"
                      variant={a.danger ? "ghost" : "outline"}
                      className={a.danger ? "text-destructive hover:bg-destructive/10" : undefined}
                      onClick={() => {
                        if (a.danger && !window.confirm(`Confermi: ${a.label}?`)) return;
                        onAction(e.id, "transition", a.target);
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
