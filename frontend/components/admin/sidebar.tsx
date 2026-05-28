"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Calendar, Tag, QrCode, Mail, Server, ShieldAlert, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events", label: "Eventi", icon: Calendar },
  { href: "/admin/categories", label: "Categorie", icon: Tag },
  { href: "/admin/checkin", label: "Check-in", icon: QrCode },
  { href: "/admin/notifications", label: "Notifiche", icon: Mail },
  { href: "/admin/settings/ldap", label: "AD / LDAP", icon: Server },
  { href: "/admin/audit", label: "Audit & GDPR", icon: ShieldAlert },
] as const;

export function Sidebar() {
  const pathname = usePathname() || "";
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-brand-800">Eurospital</div>
          <div className="text-xs text-muted-foreground">Eventi</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 text-sm">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname === href || pathname.startsWith(href + "/");
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
      <div className="border-t p-4 text-[11px] text-muted-foreground">
        v1.0.0-rc1 · MVP
      </div>
    </aside>
  );
}
