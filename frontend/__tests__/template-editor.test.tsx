import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TemplateEditor } from "@/components/admin/notifications/template-editor";

const initial = {
  code: "registration_confirmed",
  name: "Conferma iscrizione",
  subject: "Conferma {{ event.title }}",
  body_html: "<p>Ciao {{ user.full_name }}</p>",
  updated_at: "2026-05-28T10:00:00",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TemplateEditor", () => {
  it("renders subject and body", () => {
    render(<TemplateEditor initial={initial} />);
    expect((screen.getByLabelText("Oggetto") as HTMLInputElement).value).toBe(initial.subject);
    expect((screen.getByLabelText("Corpo HTML") as HTMLTextAreaElement).value).toBe(initial.body_html);
  });

  it("calls updateTemplate on save with edited values", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...initial, subject: "Nuovo" }), { status: 200 }),
    );
    render(<TemplateEditor initial={initial} />);
    fireEvent.change(screen.getByLabelText("Oggetto"), { target: { value: "Nuovo" } });
    fireEvent.click(screen.getByText("Salva"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain("/admin/notification-templates/registration_confirmed");
    expect(call[1]?.method).toBe("PUT");
    expect(String(call[1]?.body)).toContain("Nuovo");
  });
});
