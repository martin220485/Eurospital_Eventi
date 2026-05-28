import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ registration_id: 1, user_id: 5, username: "mrossi", event_title: "Corso", status: "attended" }),
  })) as unknown as typeof fetch);
});

import { CheckinScanner } from "@/components/admin/checkin-scanner";

describe("CheckinScanner", () => {
  it("shows success result after submitting a token", async () => {
    render(<CheckinScanner />);
    fireEvent.change(screen.getByPlaceholderText("Token QR"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Check-in"));
    await waitFor(() => expect(screen.getByText(/mrossi/)).toBeInTheDocument());
  });
});
