const COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  confirmed: "bg-green-100 text-green-700",
  waitlisted: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-700",
  attended: "bg-blue-100 text-blue-700",
  no_show: "bg-orange-100 text-orange-800",
};

export function RegistrationStatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${COLORS[status] ?? "bg-gray-100"}`}>{status}</span>;
}
