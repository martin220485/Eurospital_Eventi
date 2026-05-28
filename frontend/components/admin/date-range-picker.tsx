"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function fmt(d?: string) {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });
}

export function DateRangePicker({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const custom = !!to;

  function apply() {
    const sp = new URLSearchParams();
    if (f) sp.set("date_from", f);
    if (t) sp.set("date_to", t);
    router.push(`/admin${sp.toString() ? `?${sp.toString()}` : ""}`);
    setOpen(false);
  }

  function clear() {
    setF("");
    setT("");
    router.push("/admin");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-current={custom ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors",
            custom
              ? "bg-brand-600 font-medium text-white"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {custom ? `${fmt(from)} – ${fmt(to)}` : "Personalizzato"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <p className="text-sm font-medium">Periodo personalizzato</p>
        <label className="block space-y-1 text-xs text-muted-foreground">
          Dal
          <Input type="date" value={f} max={t || undefined} onChange={(e) => setF(e.target.value)} />
        </label>
        <label className="block space-y-1 text-xs text-muted-foreground">
          Al
          <Input type="date" value={t} min={f || undefined} onChange={(e) => setT(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={apply} disabled={!f && !t}>
            Applica
          </Button>
          {custom && (
            <Button size="sm" variant="ghost" onClick={clear}>
              Azzera
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
