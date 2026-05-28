import { api } from "@/lib/admin-api";

export type CatalogEvent = {
  id: number; title: string; short_description: string | null;
  category_id: number | null; category_name: string | null; category_color: string | null;
  mode: string; start_at: string; end_at: string;
  available_spots: number | null; registration_open: boolean; my_status: string | null;
};
export type CustomField = {
  id: number; label: string; field_type: string; required: boolean;
  placeholder: string | null; options: { label: string; value: string }[];
};
export type CatalogEventDetail = CatalogEvent & {
  description: string | null; location_name: string | null; address: string | null;
  online_url: string | null; waitlist_enabled: boolean; custom_fields: CustomField[];
};
export type MyEvent = {
  registration_id: number; event_id: number; event_title: string;
  event_start_at: string; status: string;
};

export const catalogApi = {
  list: (qs = "") => api.get<{ items: CatalogEvent[]; total: number }>(`/catalog/events${qs}`),
  detail: (id: number) => api.get<CatalogEventDetail>(`/catalog/events/${id}`),
  myEvents: () => api.get<MyEvent[]>("/catalog/my-events"),
};
