"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, CalendarDays, Home, ListChecks, Ticket, User } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Dashboard", icon: Home },
  { href: "/app/catalog", label: "Catalogo", icon: Calendar },
  { href: "/app/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/app/registrations", label: "Le mie iscrizioni", icon: Ticket },
  { href: "/app/profile", label: "Profilo", icon: User },
];

export function UserNav() {
  const pathname = usePathname() || "";
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-brand-800">Eurospital</div>
          <div className="text-xs text-muted-foreground">Area dipendente</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 text-sm">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                active
                  ? "bg-brand-50 text-brand-800 font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
