import { describe, expect, it } from "vitest";
import { dayRange, groupByDay, monthRange, weekRange } from "@/lib/calendar-utils";

describe("calendar-utils", () => {
  it("monthRange covers full weeks around the month", () => {
    const { from, to } = monthRange(new Date("2026-02-15T00:00:00"));
    expect(from.getDay()).toBe(1); // Monday
    expect(from <= new Date("2026-02-01")).toBe(true);
    expect(to >= new Date("2026-02-28")).toBe(true);
  });
  it("weekRange is Monday..Sunday", () => {
    const { from, to } = weekRange(new Date("2026-02-18T00:00:00")); // Wed
    expect(from.getDay()).toBe(1);
    expect(to.getDay()).toBe(0);
  });
  it("dayRange spans one day", () => {
    const { from, to } = dayRange(new Date("2026-02-18T13:00:00"));
    expect(from.getHours()).toBe(0);
    expect(to.getTime() - from.getTime()).toBeGreaterThan(23 * 3600 * 1000);
  });
  it("groupByDay buckets events by ISO date", () => {
    const evs = [
      { id: 1, start_at: "2026-02-18T09:00:00" },
      { id: 2, start_at: "2026-02-18T15:00:00" },
      { id: 3, start_at: "2026-02-19T10:00:00" },
    ];
    const g = groupByDay(evs);
    expect(g.get("2026-02-18")?.length).toBe(2);
    expect(g.get("2026-02-19")?.length).toBe(1);
  });
});
