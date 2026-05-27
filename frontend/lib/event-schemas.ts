import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(1).max(150),
  color: z.string().default("#0a66c2"),
  description: z.string().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const eventSchema = z.object({
  title: z.string().min(1).max(255),
  short_description: z.string().optional(),
  description: z.string().optional(),
  category_id: z.coerce.number().int().optional().nullable(),
  mode: z.enum(["physical", "online", "hybrid"]).default("physical"),
  location_name: z.string().optional(),
  address: z.string().optional(),
  online_url: z.string().optional(),
  start_at: z.string().min(1),
  end_at: z.string().min(1),
  registration_open_at: z.string().optional().nullable(),
  registration_close_at: z.string().optional().nullable(),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  waitlist_enabled: z.boolean().default(false),
  max_per_user: z.coerce.number().int().positive().default(1),
  cancellation_allowed: z.boolean().default(true),
  internal_notes: z.string().optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

export const FIELD_TYPES = [
  "text", "textarea", "number", "email", "phone", "date", "time", "datetime",
  "checkbox", "checkbox_multi", "radio", "select", "select_multi", "file", "privacy_consent",
] as const;

export const OPTION_TYPES = ["radio", "select", "select_multi", "checkbox_multi"];
