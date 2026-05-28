import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/app/register-form";

const fields = [
  { id: 1, label: "Note", field_type: "text", required: false, placeholder: null, options: [] },
  { id: 2, label: "Privacy", field_type: "privacy_consent", required: true, placeholder: null, options: [] },
];

describe("RegisterForm", () => {
  it("blocks submit until required consent is checked", () => {
    const onSubmit = vi.fn();
    render(<RegisterForm eventId={1} fields={fields} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Iscriviti"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/consenso/i)).toBeInTheDocument();
  });

  it("submits answers when consent given", () => {
    const onSubmit = vi.fn();
    render(<RegisterForm eventId={1} fields={fields} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText("Privacy"));
    fireEvent.click(screen.getByText("Iscriviti"));
    expect(onSubmit).toHaveBeenCalledWith([
      { field_id: 1, value: "" },
      { field_id: 2, value: "true" },
    ]);
  });
});
