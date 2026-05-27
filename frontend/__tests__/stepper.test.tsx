import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper } from "@/components/stepper";

describe("Stepper", () => {
  it("marks current step active and prior steps done", () => {
    render(<Stepper steps={["A", "B", "C"]} current={1} />);
    expect(screen.getByText("A").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("B").closest("li")).toHaveAttribute("data-state", "active");
    expect(screen.getByText("C").closest("li")).toHaveAttribute("data-state", "todo");
  });
});
