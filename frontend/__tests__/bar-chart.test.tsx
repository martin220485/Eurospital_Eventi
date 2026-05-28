import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart } from "@/components/admin/bar-chart";

describe("BarChart", () => {
  it("shows empty state when no data", () => {
    render(<BarChart data={[]} title="Nessuno" />);
    expect(screen.getByText("Nessun dato.")).toBeInTheDocument();
  });

  it("shows title when provided", () => {
    render(<BarChart data={[{ label: "x", value: 1 }]} title="Iscrizioni" />);
    expect(screen.getByText("Iscrizioni")).toBeInTheDocument();
  });
});
