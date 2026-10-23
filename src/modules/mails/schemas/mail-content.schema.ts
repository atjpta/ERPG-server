import { z } from "zod";

/** Tiêu đề + nội dung của một ngôn ngữ. Nội dung có thể chứa `{param}` được thay bằng `params` của thư. */
export const MailTextSchema = z.object({
    subject: z.string().max(200),
    body: z.string().max(4000),
});
export type MailText = z.infer<typeof MailTextSchema>;

/** Nội dung đa ngôn ngữ theo mã locale (`vi`, `en`...). Phải có `mail_config.defaultLocale` (xem `MailService`). */
export const MailContentSchema = z.record(z.string().min(1).max(16), MailTextSchema);
export type MailContent = z.infer<typeof MailContentSchema>;

/** Giá trị thay vào `{param}` của mẫu thư. */
export const MailParamsSchema = z.record(
    z.string().min(1).max(32),
    z.union([z.string(), z.number()])
);
export type MailParams = z.infer<typeof MailParamsSchema>;
