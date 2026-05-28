import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventCard } from "@/components/app/event-card";

const base = {
  id: 1, title: "Corso", short_description: "desc", category_id: null, category_name: "Form",
  category_color: "#123", mode: "online", start_at: "2030-01-01T09:00:00", end_at: "2030-01-01T10:00:00",
  available_spots: 0, registration_open: false, my_status: null,
};

describe("EventCard", () => {
  it("shows full badge when no spots", () => {
    render(<EventCard event={base} />);
    expect(screen.getByText("Corso")).toBeInTheDocument();
    expect(screen.getByText(/esauriti/i)).toBeInTheDocument();
  });
  it("shows my status when registered", () => {
    render(<EventCard event={{ ...base, available_spots: 5, my_status: "confirmed" }} />);
    expect(screen.getByText(/iscritto/i)).toBeInTheDocument();
  });
});
