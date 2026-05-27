import { describe, expect, it } from "vitest";
import { adminSchema } from "@/lib/setup-schemas";

describe("adminSchema", () => {
  it("rejects short password", () => {
    const r = adminSchema.safeParse({ email: "a@b.it", username: "abc", password: "short" });
    expect(r.success).toBe(false);
  });
  it("accepts valid admin", () => {
    const r = adminSchema.safeParse({
      email: "a@b.it", username: "admin", password: "StrongPass1!",
    });
    expect(r.success).toBe(true);
  });
});
