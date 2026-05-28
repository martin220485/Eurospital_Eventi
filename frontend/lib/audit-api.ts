import { api } from "./admin-api";

export type AuditLogItem = {
  id: number;
  actor_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  ip: string | null;
  user_agent: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export const auditApi = {
  list: (params?: { actor_id?: number; action?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.actor_id != null) sp.set("actor_id", String(params.actor_id));
    if (params?.action) sp.set("action", params.action);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.offset != null) sp.set("offset", String(params.offset));
    const qs = sp.toString();
    return api.get<{ items: AuditLogItem[]; total: number }>(
      `/admin/audit-logs${qs ? `?${qs}` : ""}`
    );
  },
  anonymizeUser: (userId: number) =>
    api.post<{ ok: boolean; user_id: number; anonymized_at: string }>(
      `/admin/users/${userId}/anonymize`,
    ),
};
