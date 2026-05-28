"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CalendarRange,
  Loader2,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { EventCard } from "@/components/app/event-card";
import { catalogApi, type CatalogEvent } from "@/lib/catalog-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SortDir = "asc" | "desc";

type Category = { id: number; name: string; color: string | null };

function isAvailable(e: CatalogEvent) {
  return e.available_spots === null || e.available_spots > 0;
}

export default function CatalogPage() {
  const [raw, setRaw] = useState<CatalogEvent[] | null>(null);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Structural filters (client-side, instant).
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set());
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Becomes true once filters are hydrated from the URL; gates fetch + URL sync.
  const [ready, setReady] = useState(false);
  const didInitialFetch = useRef(false);

  const load = useCallback(async (search: string) => {
    setError("");
    setPending(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    try {
      const res = await catalogApi.list(`?${params.toString()}`);
      setRaw(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }, []);

  // Hydrate filter state from the URL once, on mount. Lets users bookmark and
  // share a filtered view (e.g. "formazione di giugno").
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setQ(sp.get("q") ?? "");
    const cats = sp.get("cat");
    if (cats) {
      setSelectedCats(
        new Set(cats.split(",").map(Number).filter((n) => !Number.isNaN(n))),
      );
    }
    setOnlyAvailable(sp.get("avail") === "1");
    setOnlyOpen(sp.get("open") === "1");
    setDateFrom(sp.get("from") ?? "");
    setDateTo(sp.get("to") ?? "");
    setSortDir(sp.get("sort") === "desc" ? "desc" : "asc");
    setReady(true);
  }, []);

  // Fetch: immediate on first ready render, then debounced ~300ms on q change.
  useEffect(() => {
    if (!ready) return;
    const delay = didInitialFetch.current ? 300 : 0;
    didInitialFetch.current = true;
    const t = setTimeout(() => load(q), delay);
    return () => clearTimeout(t);
  }, [ready, q, load]);

  // Categories present in the current result set (the only ones worth offering).
  const categories = useMemo<Category[]>(() => {
    if (!raw) return [];
    const map = new Map<number, Category>();
    for (const e of raw) {
      if (e.category_id != null && !map.has(e.category_id)) {
        map.set(e.category_id, {
          id: e.category_id,
          name: e.category_name ?? "Senza categoria",
          color: e.category_color,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [raw]);

  const filtersActive =
    selectedCats.size > 0 || onlyAvailable || onlyOpen || !!dateFrom || !!dateTo;
  const searchActive = q.trim().length > 0;

  const filtered = useMemo(() => {
    if (!raw) return [];
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const out = raw.filter((e) => {
      if (selectedCats.size > 0 && (e.category_id == null || !selectedCats.has(e.category_id)))
        return false;
      if (onlyAvailable && !isAvailable(e)) return false;
      if (onlyOpen && !e.registration_open) return false;
      const ts = new Date(e.start_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    });
    out.sort((a, b) => {
      const d = new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
      return sortDir === "asc" ? d : -d;
    });
    return out;
  }, [raw, selectedCats, onlyAvailable, onlyOpen, dateFrom, dateTo, sortDir]);

  const mine = useMemo(() => filtered.filter((e) => e.my_status), [filtered]);
  const rest = useMemo(() => filtered.filter((e) => !e.my_status), [filtered]);

  // Sync the active filters back into the URL (replace, no history spam).
  useEffect(() => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (selectedCats.size) sp.set("cat", [...selectedCats].join(","));
    if (onlyAvailable) sp.set("avail", "1");
    if (onlyOpen) sp.set("open", "1");
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);
    if (sortDir === "desc") sp.set("sort", "desc");
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [ready, q, selectedCats, onlyAvailable, onlyOpen, dateFrom, dateTo, sortDir]);

  function toggleCat(id: number) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSelectedCats(new Set());
    setOnlyAvailable(false);
    setOnlyOpen(false);
    setDateFrom("");
    setDateTo("");
  }

  function clearAll() {
    clearFilters();
    setQ("");
  }

  const dateLabel =
    dateFrom && dateTo
      ? `${fmtDay(dateFrom)} – ${fmtDay(dateTo)}`
      : dateFrom
        ? `Dal ${fmtDay(dateFrom)}`
        : dateTo
          ? `Fino al ${fmtDay(dateTo)}`
          : "Periodo";

  const count = filtered.length;
  const countLabel =
    filtersActive || searchActive
      ? `${count} ${count === 1 ? "risultato" : "risultati"}`
      : `${count} ${count === 1 ? "evento" : "eventi"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1>Catalogo eventi</h1>
        {raw !== null && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {countLabel}
          </span>
        )}
        <p className="w-full text-sm text-muted-foreground">
          Sfoglia gli eventi disponibili e iscriviti
        </p>
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        {/* Row 1: search + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="px-8"
              placeholder="Cerca eventi…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Cerca eventi"
            />
            {pending ? (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            ) : q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Cancella ricerca"
                className="absolute right-1.5 top-1.5 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Ordina per data, ${sortDir === "asc" ? "crescente" : "decrescente"}`}
          >
            {sortDir === "asc" ? (
              <ArrowUpNarrowWide className="h-4 w-4" />
            ) : (
              <ArrowDownNarrowWide className="h-4 w-4" />
            )}
            {sortDir === "asc" ? "Prima i prossimi" : "Prima i più lontani"}
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={dateFrom || dateTo ? "secondary" : "outline"}
                size="sm"
                aria-label="Filtra per periodo"
              >
                <CalendarRange className="h-4 w-4" />
                {dateLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="space-y-3">
              <p className="text-sm font-medium">Periodo</p>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Dal
                <Input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Al
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Azzera periodo
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 2: category chips + toggles */}
        {(categories.length > 0 || raw !== null) && (
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => {
              const active = selectedCats.has(c.id);
              return (
                <FilterChip key={c.id} active={active} onClick={() => toggleCat(c.id)}>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: c.color ?? "#3a7fb3" }}
                    aria-hidden
                  />
                  {c.name}
                </FilterChip>
              );
            })}
            {categories.length > 0 && (
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            )}
            <FilterChip active={onlyAvailable} onClick={() => setOnlyAvailable((v) => !v)}>
              Solo posti liberi
            </FilterChip>
            <FilterChip active={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
              Iscrizioni aperte
            </FilterChip>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Azzera filtri
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">
              Impossibile caricare gli eventi. {error}
            </p>
            <Button variant="outline" size="sm" onClick={() => load(q)}>
              <RotateCw className="h-4 w-4" />
              Riprova
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && raw === null ? (
        <EventGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </EventGrid>
      ) : !error && filtered.length === 0 ? (
        <EmptyState
          filtered={filtersActive || searchActive}
          query={q}
          onReset={clearAll}
        />
      ) : !error ? (
        <div className="space-y-8">
          {mine.length > 0 && (
            <Section title="I miei eventi" count={mine.length}>
              <EventGrid>
                {mine.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </EventGrid>
            </Section>
          )}
          {rest.length > 0 && (
            <Section title={mine.length > 0 ? "Tutti gli eventi" : undefined} count={rest.length}>
              <EventGrid>
                {rest.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </EventGrid>
            </Section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EventGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      {title && (
        <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
          {title}
          {typeof count === "number" && (
            <span className="text-sm font-normal text-muted-foreground">{count}</span>
          )}
        </h2>
      )}
      {children}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
          : "border-input bg-background text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  filtered,
  query,
  onReset,
}: {
  filtered: boolean;
  query: string;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <CalendarRange className="h-10 w-10 text-muted-foreground" aria-hidden />
        {filtered ? (
          <>
            <p className="font-medium">
              {query.trim() ? `Nessun risultato per “${query.trim()}”` : "Nessun evento con questi filtri"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Prova a modificare la ricerca o i filtri per vedere più eventi.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onReset}>
              <X className="h-3.5 w-3.5" />
              Azzera tutto
            </Button>
          </>
        ) : (
          <>
            <p className="font-medium">Nessun evento disponibile</p>
            <p className="text-sm text-muted-foreground">
              Al momento non ci sono eventi pubblicati. Torna più tardi.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDay(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}
