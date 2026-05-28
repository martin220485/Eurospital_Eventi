import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditLogTable } from "@/components/admin/audit-log-table";

const sample = [
  {
    id: 1, actor_id: 7, action: "auth.login.success",
    target_type: null, target_id: null, ip: "1.1.1.1",
    user_agent: "x", payload: null, created_at: "2026-05-28T10:00:00",
  },
];

describe("AuditLogTable", () => {
  it("renders rows", () => {
    render(<AuditLogTable initialItems={sample} initialTotal={1} />);
    expect(screen.getByText("auth.login.success")).toBeInTheDocument();
    expect(screen.getByText("1.1.1.1")).toBeInTheDocument();
  });

  it("shows empty state when no rows", () => {
    render(<AuditLogTable initialItems={[]} initialTotal={0} />);
    expect(screen.getByText("Nessuna voce.")).toBeInTheDocument();
  });
});
