import Link from "next/link";

const LINKS = [
  ["Dashboard", "/app"],
  ["Catalogo", "/app/catalog"],
  ["Calendario", "/app/calendar"],
  ["Le mie iscrizioni", "/app/registrations"],
  ["Profilo", "/app/profile"],
];

export function UserNav() {
  return (
    <nav className="w-56 shrink-0 border-r bg-gray-50 p-4">
      <div className="mb-6 text-lg font-semibold text-blue-700">Eurospital Eventi</div>
      <ul className="space-y-1 text-sm">
        {LINKS.map(([label, href]) => (
          <li key={href}><Link className="block rounded px-3 py-2 hover:bg-blue-100" href={href}>{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
