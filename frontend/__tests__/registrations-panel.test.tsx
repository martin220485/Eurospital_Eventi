import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ items: [
      { id: 1, user_id: 5, username: "mrossi", email: "m@x.it", status: "confirmed", waitlist_position: null, checked_in: false },
      { id: 2, user_id: 6, username: "gverdi", email: "g@x.it", status: "waitlisted", waitlist_position: 1, checked_in: false },
    ], total: 2, page: 1, page_size: 50 }),
  })) as unknown as typeof fetch);
});

import { RegistrationsPanel } from "@/components/admin/registrations-panel";

describe("RegistrationsPanel", () => {
  it("renders registrant rows with status", async () => {
    render(<RegistrationsPanel eventId={1} />);
    expect(await screen.findByText("mrossi")).toBeInTheDocument();
    expect(screen.getByText("gverdi")).toBeInTheDocument();
    expect(screen.getAllByText("waitlisted").length).toBeGreaterThan(0);
  });
});
