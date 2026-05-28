import { api } from "./admin-api";

// Users
export type UserItem = {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  department: string | null;
  auth_source: string;
  is_active: boolean;
  roles: string[];
  created_at: string | null;
};

export const usersApi = {
  list: (q?: { q?: string; active?: boolean }) => {
    const sp = new URLSearchParams();
    if (q?.q) sp.set("q", q.q);
    if (q?.active != null) sp.set("active", String(q.active));
    return api.get<{ items: UserItem[]; total: number }>(`/admin/users${sp.toString() ? `?${sp}` : ""}`);
  },
  create: (body: { email: string; username: string; password: string; full_name?: string; department?: string; role?: string }) =>
    api.post<UserItem>("/admin/users", body),
  update: (id: number, body: Partial<UserItem>) =>
    api.patch<UserItem>(`/admin/users/${id}`, body),
  assignRole: (id: number, role: string) =>
    api.post<UserItem>(`/admin/users/${id}/roles/${role}`),
  listRoles: () => api.get<string[]>("/admin/roles"),
};

// Platform settings
export type PlatformSettings = {
  name: string;
  logo_url: string | null;
  primary_color: string;
  language: string;
  timezone: string;
  public_url: string | null;
  retention_days: number | null;
  feature_flags: Record<string, unknown>;
  setup_completed: boolean;
};

export const platformApi = {
  getSettings: () => api.get<PlatformSettings>("/admin/platform/settings"),
  saveSettings: (body: Partial<PlatformSettings>) =>
    api.put<PlatformSettings>("/admin/platform/settings", body),
  status: () => api.get<{
    status: string;
    version: string;
    checks: Record<string, string>;
    recent_failed_notifications: Array<Record<string, unknown>>;
    audit_retention_days: number;
  }>("/admin/platform/status"),
  dbStatus: () => api.get<{
    current_revision: string | null;
    head_revision: string | null;
    up_to_date: boolean;
    tables: string[];
    views: string[];
  }>("/admin/platform/db"),
  dbMigrate: () => api.post<{ revision: string; tables: string[] }>("/admin/platform/db/migrate"),
  dbRebuild: () => api.post<{ revision: string; tables: string[] }>("/admin/platform/db/rebuild-objects"),
};

// SMTP settings
export type SmtpSettings = {
  host: string | null;
  port: number | null;
  tls_mode: string;
  from_address: string | null;
  from_name: string | null;
  username: string | null;
  has_password: boolean;
};

export const smtpApi = {
  getSettings: () => api.get<SmtpSettings>("/admin/platform/smtp"),
  saveSettings: (body: Partial<SmtpSettings> & { password?: string }) =>
    api.put<SmtpSettings>("/admin/platform/smtp", body),
  test: (body: {
    host: string; port: number; tls_mode: string;
    username?: string | null; password?: string | null;
    from_address: string;
  }) => api.post<{ ok: boolean; error?: string }>("/admin/platform/smtp/test", body),
};

// Broadcast notifications
export const broadcastApi = {
  send: (body: {
    template_code: string;
    target: "all" | "event" | "role";
    event_id?: number;
    event_status?: string;
    role_name?: string;
  }) => api.post<{ ok: boolean; queued: number; target: string }>("/admin/notifications/broadcast", body),
};
