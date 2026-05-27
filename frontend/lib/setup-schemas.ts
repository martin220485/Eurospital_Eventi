import { z } from "zod";

export const adminSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(128),
});
export type AdminInput = z.infer<typeof adminSchema>;

export const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  tls_mode: z.enum(["none", "starttls", "ssl"]).default("starttls"),
  from_address: z.string().email(),
  from_name: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type SmtpInput = z.infer<typeof smtpSchema>;

export const platformSchema = z.object({
  name: z.string().min(1),
  primary_color: z.string().default("#0a66c2"),
  language: z.string().default("it"),
  timezone: z.string().default("Europe/Rome"),
  public_url: z.string().optional(),
});
export type PlatformInput = z.infer<typeof platformSchema>;
