const COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-green-100 text-green-700",
  suspended: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-700",
  archived: "bg-blue-100 text-blue-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${COLORS[status] ?? "bg-gray-100"}`}>{status}</span>;
}
