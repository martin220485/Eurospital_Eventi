"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, AtSign, Calendar, ChevronDown, Database, LayoutDashboard, LogOut, Mail, Menu,
  QrCode, Server, Settings, ShieldAlert, Tag, User as UserIcon, Users, X,
} from "lucide-react";
import { api, logout } from "@/lib/admin-api";
import { BrandLogo } from "@/components/brand-logo";
import { Separator } from "@/components/ui/separator";

const MOBILE_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events", label: "Eventi", icon: Calendar },
  { href: "/admin/categories", label: "Categorie", icon: Tag },
  { href: "/admin/checkin", label: "Check-in", icon: QrCode },
  { href: "/admin/users", label: "Utenti", icon: Users },
  { href: "/admin/notifications", label: "Notifiche", icon: Mail },
  { href: "/admin/settings/platform", label: "Configurazione", icon: Settings },
  { href: "/admin/settings/smtp", label: "SMTP", icon: AtSign },
  { href: "/admin/settings/ldap", label: "AD/LDAP", icon: Server },
  { href: "/admin/system", label: "Stato sistema", icon: Activity },
  { href: "/admin/system/database", label: "Database", icon: Database },
  { href: "/admin/audit", label: "Audit & GDPR", icon: ShieldAlert },
];

export function Topbar() {
  const router = useRouter();
  const [me, setMe] = useState<{ username: string; full_name?: string; email?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    api.get<{ username: string; full_name?: string; email?: string }>("/auth/me")
      .then(setMe).catch(() => {});
  }, []);

  async function doLogout() {
    await logout();
    router.push("/login");
  }

  const display = me?.full_name ?? me?.username ?? "—";
  const initials = (me?.full_name ?? me?.username ?? "?")
    .split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button className="md:hidden p-1" onClick={() => setMobileNav(true)} aria-label="Apri menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="md:hidden"><BrandLogo /></div>
          <div className="hidden md:block text-sm text-muted-foreground">Backoffice</div>
        </div>
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-tight">{display}</div>
              <div className="text-xs text-muted-foreground">{me?.email ?? ""}</div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {open && (
            <div className="absolute right-0 top-12 z-50 w-56 rounded-md border bg-popover shadow-card"
                 onMouseLeave={() => setOpen(false)}>
              <div className="px-3 py-2 text-sm">
                <div className="font-medium">{display}</div>
                <div className="text-xs text-muted-foreground">{me?.email}</div>
              </div>
              <Separator />
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => router.push("/app/profile")}>
                <UserIcon className="h-4 w-4" /> Profilo
              </button>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                      onClick={doLogout}>
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {mobileNav && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileNav(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <BrandLogo />
                <div className="text-sm font-semibold text-brand-800">Eurospital</div>
              </div>
              <button onClick={() => setMobileNav(false)} aria-label="Chiudi">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 p-3 text-sm">
              {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMobileNav(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
