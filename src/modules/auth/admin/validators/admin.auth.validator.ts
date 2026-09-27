import { z } from "zod";

export const AdminLoginSchema = z.object({
    email: z.email(),
    password: z.string().min(1).max(64),
});
export type AdminLoginBody = z.infer<typeof AdminLoginSchema>;
