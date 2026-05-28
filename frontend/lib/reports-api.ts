import { api } from "./admin-api";

export type MonthBucket = { month: string; count: number };
export type TopEventItem = { event_id: number; title: string; confirmed: number };

export type KpiOut = {
  events_total: number;
  events_published: number;
  events_upcoming: number;
  events_past: number;
  registrations_total: number;
  registrations_confirmed: number;
  registrations_cancelled: number;
  registrations_waitlisted: number;
  registrations_attended: number;
  registrations_no_show: number;
  attendance_rate: number;
  registrations_by_month: MonthBucket[];
  top_events: TopEventItem[];
};

export type CountsOut = {
  confirmed: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
  no_show: number;
  pending: number;
};

export type CustomFieldOptionCount = { value: string; count: number };

export type CustomFieldSummary = {
  field_id: number;
  label: string;
  type: string;
  options: CustomFieldOptionCount[];
};

export type EventReportOut = {
  event: {
    id: number; title: string; start_at: string; end_at: string | null;
    capacity: number | null; status: string;
  };
  counts: CountsOut;
  attendance_rate: number;
  custom_fields_summary: CustomFieldSummary[];
};

export const reportsApi = {
  getKpis: (params?: { date_from?: string; date_to?: string }) => {
    const sp = new URLSearchParams();
    if (params?.date_from) sp.set("date_from", params.date_from);
    if (params?.date_to) sp.set("date_to", params.date_to);
    const qs = sp.toString();
    return api.get<KpiOut>(`/admin/reports/kpis${qs ? `?${qs}` : ""}`);
  },
  getEventReport: (eventId: number) =>
    api.get<EventReportOut>(`/admin/reports/events/${eventId}`),
  eventCsvUrl: (eventId: number) =>
    `/api/admin/reports/events/${eventId}/registrations.csv`,
  globalCsvUrl: (params?: { event_id?: number; date_from?: string; date_to?: string }) => {
    const sp = new URLSearchParams();
    if (params?.event_id != null) sp.set("event_id", String(params.event_id));
    if (params?.date_from) sp.set("date_from", params.date_from);
    if (params?.date_to) sp.set("date_to", params.date_to);
    const qs = sp.toString();
    return `/api/admin/reports/registrations.csv${qs ? `?${qs}` : ""}`;
  },
};
