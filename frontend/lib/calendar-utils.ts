function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}

export function dayRange(d: Date): { from: Date; to: Date } {
  const from = startOfDay(d);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(-1);
  return { from, to };
}

export function weekRange(d: Date): { from: Date; to: Date } {
  const from = mondayOf(d);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  to.setMilliseconds(-1);
  return { from, to };
}

export function monthRange(d: Date): { from: Date; to: Date } {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const from = mondayOf(first);
  const to = new Date(mondayOf(last));
  to.setDate(to.getDate() + 7);
  to.setMilliseconds(-1);
  return { from, to };
}

export function isoDay(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function groupByDay<T extends { start_at: string }>(events: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of events) {
    const key = isoDay(e.start_at);
    const list = m.get(key) ?? [];
    list.push(e);
    m.set(key, list);
  }
  return m;
}

export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = startOfDay(from);
  while (cur <= to) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
