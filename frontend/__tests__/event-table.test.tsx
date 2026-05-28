import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventTable } from "@/components/admin/event-table";

const items = [
  { id: 1, title: "Alpha", status: "draft", category_id: null, start_at: "2030-01-01T09:00", end_at: "2030-01-01T10:00" },
  { id: 2, title: "Beta", status: "published", category_id: null, start_at: "2030-02-01T09:00", end_at: "2030-02-01T10:00" },
];

describe("EventTable", () => {
  it("renders rows with titles and status", () => {
    render(<EventTable items={items} onAction={() => {}} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Pubblicato")).toBeInTheDocument();
  });
});
