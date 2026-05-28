import Link from "next/link";

export function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r bg-gray-50 p-4">
      <div className="mb-6 text-lg font-semibold text-blue-700">Eurospital Eventi</div>
      <ul className="space-y-1 text-sm">
        <li><Link className="block rounded px-3 py-2 hover:bg-blue-100" href="/admin/events">Eventi</Link></li>
        <li><Link className="block rounded px-3 py-2 hover:bg-blue-100" href="/admin/categories">Categorie</Link></li>
        <li><Link className="block rounded px-3 py-2 hover:bg-blue-100" href="/admin/checkin">Check-in</Link></li>
      </ul>
    </nav>
  );
}
