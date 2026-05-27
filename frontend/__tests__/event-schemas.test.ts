import { describe, expect, it } from "vitest";
import { eventSchema, categorySchema } from "@/lib/event-schemas";

describe("eventSchema", () => {
  it("requires a title", () => {
    expect(eventSchema.safeParse({ title: "", start_at: "2030-01-01T09:00", end_at: "2030-01-01T10:00", mode: "physical" }).success).toBe(false);
  });
  it("accepts a valid event", () => {
    expect(eventSchema.safeParse({ title: "C", start_at: "2030-01-01T09:00", end_at: "2030-01-01T10:00", mode: "physical" }).success).toBe(true);
  });
});

describe("categorySchema", () => {
  it("requires a name", () => {
    expect(categorySchema.safeParse({ name: "", color: "#fff" }).success).toBe(false);
  });
});
