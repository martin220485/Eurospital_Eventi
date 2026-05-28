import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LdapConfigForm } from "@/components/admin/ldap/ldap-config-form";

const initial = {
  sso_enabled: true,
  server_uri: "ldap://x",
  base_dn: "DC=x",
  bind_dn: "CN=s,DC=x",
  user_filter: "(sAMAccountName={username})",
  group_filter: null,
  attr_mapping: { email: "userPrincipalName" },
  users_group: "Users",
  admins_group: "Admins",
  has_bind_password: true,
};

beforeEach(() => vi.restoreAllMocks());

describe("LdapConfigForm", () => {
  it("renders all fields", () => {
    render(<LdapConfigForm initial={initial} />);
    expect((screen.getByLabelText("Server URI") as HTMLInputElement).value).toBe("ldap://x");
    expect((screen.getByLabelText("Base DN") as HTMLInputElement).value).toBe("DC=x");
    expect((screen.getByLabelText("Gruppo utenti") as HTMLInputElement).value).toBe("Users");
  });

  it("calls PUT settings on save with edited fields", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...initial }), { status: 200 }),
    );
    render(<LdapConfigForm initial={initial} />);
    fireEvent.change(screen.getByLabelText("Server URI"), { target: { value: "ldaps://corp" } });
    fireEvent.click(screen.getByText("Salva"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain("/admin/ldap/settings");
    expect(call[1]?.method).toBe("PUT");
    expect(String(call[1]?.body)).toContain("ldaps://corp");
  });
});
