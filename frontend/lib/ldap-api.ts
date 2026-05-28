import { api } from "./admin-api";

export type LdapSettingsOut = {
  sso_enabled: boolean;
  server_uri: string | null;
  base_dn: string | null;
  bind_dn: string | null;
  user_filter: string | null;
  group_filter: string | null;
  attr_mapping: Record<string, string>;
  users_group: string | null;
  admins_group: string | null;
  has_bind_password: boolean;
};

export type LdapSettingsIn = Omit<LdapSettingsOut, "has_bind_password"> & {
  bind_password?: string | null;
};

export type LdapPreviewOut = {
  dn: string;
  attrs: Record<string, string | null>;
  groups: string[];
  mapped_roles: string[];
};

export type LdapSyncResult = {
  ok: boolean;
  action?: string;
  user_id?: number;
  created?: number;
  updated?: number;
  errors?: number;
  message?: string;
};

export type LdapTestResult = { ok: boolean; message?: string };

export const ldapApi = {
  getSettings: () => api.get<LdapSettingsOut>("/admin/ldap/settings"),
  saveSettings: (body: LdapSettingsIn) =>
    api.put<LdapSettingsOut>("/admin/ldap/settings", body),
  testConnection: () => api.post<LdapTestResult>("/admin/ldap/test-connection"),
  preview: (username: string) =>
    api.get<LdapPreviewOut>(`/admin/ldap/preview?username=${encodeURIComponent(username)}`),
  syncUser: (username: string) =>
    api.post<LdapSyncResult>(`/admin/ldap/sync-user/${encodeURIComponent(username)}`),
  syncAll: () => api.post<LdapSyncResult>("/admin/ldap/sync-all"),
};
