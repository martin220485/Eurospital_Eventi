import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => [],
  })) as unknown as typeof fetch);
});

import { FieldBuilder } from "@/components/admin/field-builder";

describe("FieldBuilder", () => {
  it("adds a field row when clicking add", async () => {
    render(<FieldBuilder eventId={1} />);
    fireEvent.click(await screen.findByText("Aggiungi campo"));
    expect(screen.getByPlaceholderText("Etichetta campo")).toBeInTheDocument();
  });
});
