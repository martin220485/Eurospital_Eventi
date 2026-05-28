"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, User as UserIcon } from "lucide-react";
import { api, logout } from "@/lib/admin-api";
import { Separator } from "@/components/ui/separator";

type Me = {
  username: string;
  full_name?: string;
  email?: string;
  permissions?: string[];
  roles?: string[];
};

export function UserTopbar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get<Me>("/auth/me").then(setMe).catch(() => {});
  }, []);

  async function doLogout() {
    await logout();
    router.push("/login");
  }

  const display = me?.full_name ?? me?.username ?? "—";
  const initials = (me?.full_name ?? me?.username ?? "?")
    .split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  const hasBackoffice = !!me?.permissions?.length;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <div className="text-sm text-muted-foreground">Area dipendente</div>
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
          <div
            className="absolute right-0 top-12 z-50 w-56 rounded-md border bg-popover shadow-card"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="px-3 py-2 text-sm">
              <div className="font-medium">{display}</div>
              <div className="text-xs text-muted-foreground">{me?.email}</div>
            </div>
            <Separator />
            {hasBackoffice && (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-accent"
                  onClick={() => router.push("/admin")}
                >
                  <LayoutDashboard className="h-4 w-4" /> Backoffice
                </button>
                <Separator />
              </>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              onClick={() => router.push("/app/profile")}
            >
              <UserIcon className="h-4 w-4" /> Profilo
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
              onClick={doLogout}
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
