import { z } from "zod";

export const manualRegisterSchema = z.object({
  user_id: z.coerce.number().int().positive(),
});
export type ManualRegisterInput = z.infer<typeof manualRegisterSchema>;

export const checkinTokenSchema = z.object({
  token: z.string().min(1),
});
