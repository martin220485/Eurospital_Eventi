import { api } from "./admin-api";

export type TemplateOut = {
  code: string;
  name: string;
  subject: string;
  body_html: string;
  updated_at: string;
};

export type TemplateUpdate = {
  subject: string;
  body_html: string;
};

export type PreviewOut = {
  subject_rendered: string;
  body_rendered: string;
};

export type LogOut = {
  id: number;
  template_code: string;
  registration_id: number | null;
  user_id: number;
  to_address: string;
  subject: string;
  status: string;
  error_text: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
};

export type LogQuery = {
  user_id?: number;
  status_filter?: string;
  template?: string;
  limit?: number;
  offset?: number;
};

function qs(q: LogQuery): string {
  const sp = new URLSearchParams();
  if (q.user_id != null) sp.set("user_id", String(q.user_id));
  if (q.status_filter) sp.set("status_filter", q.status_filter);
  if (q.template) sp.set("template", q.template);
  if (q.limit != null) sp.set("limit", String(q.limit));
  if (q.offset != null) sp.set("offset", String(q.offset));
  return sp.toString();
}

export const notificationsApi = {
  listTemplates: () => api.get<TemplateOut[]>("/admin/notification-templates"),
  getTemplate: (code: string) => api.get<TemplateOut>(`/admin/notification-templates/${code}`),
  updateTemplate: (code: string, body: TemplateUpdate) =>
    api.put<TemplateOut>(`/admin/notification-templates/${code}`, body),
  preview: (code: string, sampleContext?: Record<string, unknown>) =>
    api.post<PreviewOut>(
      `/admin/notification-templates/${code}/preview`,
      { sample_context: sampleContext ?? null },
    ),
  listLogs: (q: LogQuery) =>
    api.get<{ items: LogOut[]; total: number }>(
      `/admin/notification-logs${qs(q) ? `?${qs(q)}` : ""}`,
    ),
  resend: (id: number) => api.post<void>(`/admin/notification-logs/${id}/resend`),
};
