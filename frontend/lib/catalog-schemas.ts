import { z } from "zod";

export const changePasswordSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});
