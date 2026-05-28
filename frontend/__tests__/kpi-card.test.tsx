import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "@/components/admin/kpi-card";

describe("KpiCard", () => {
  it("renders label and value", () => {
    render(<KpiCard label="Eventi" value={42} />);
    expect(screen.getByText("Eventi")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
  it("renders hint when provided", () => {
    render(<KpiCard label="x" value="y" hint="prossimi 30 giorni" />);
    expect(screen.getByText("prossimi 30 giorni")).toBeInTheDocument();
  });
});
