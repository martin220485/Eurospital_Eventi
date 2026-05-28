import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart } from "@/components/admin/bar-chart";

describe("BarChart", () => {
  it("shows empty state when no data", () => {
    render(<BarChart data={[]} title="Nessuno" />);
    expect(screen.getByText("Nessun dato.")).toBeInTheDocument();
  });

  it("renders one rect per data point", () => {
    const { container } = render(
      <BarChart data={[{ label: "2026-01", value: 10 }, { label: "2026-02", value: 5 }]} />,
    );
    expect(container.querySelectorAll("rect").length).toBe(2);
  });

  it("uses title for accessibility", () => {
    render(<BarChart data={[{ label: "x", value: 1 }]} title="Iscrizioni" />);
    expect(screen.getByRole("img", { name: "Iscrizioni" })).toBeInTheDocument();
  });
});
