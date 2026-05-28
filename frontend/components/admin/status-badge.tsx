import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Bozza", variant: "secondary" },
  published: { label: "Pubblicato", variant: "success" },
  suspended: { label: "Sospeso", variant: "warning" },
  cancelled: { label: "Annullato", variant: "destructive" },
  archived: { label: "Archiviato", variant: "outline" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
