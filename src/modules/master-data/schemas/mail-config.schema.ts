import { z } from "zod";

/** Master data `mail_config`. */
export const MailConfigSchema = z
    .object({
        /** Thư hết hạn sau chừng này ngày kể từ lúc gửi / phát. */
        retentionDays: z.number().int().positive(),
        /** Số thư người chơi tối đa trong hộp thư của một người (thư hệ thống không tính để thưởng không bị mất). */
        maxInbox: z.number().int().positive(),
        /** Ngôn ngữ có nội dung thư hệ thống (mã locale). */
        locales: z.array(z.string().min(1).max(16)).min(1),
        /** Ngôn ngữ dự phòng đầu tiên khi thiếu ngôn ngữ yêu cầu; mọi thư hệ thống bắt buộc có ngôn ngữ này. */
        defaultLocale: z.string().min(1).max(16),
        subjectMaxLength: z.number().int().positive().max(200),
        bodyMaxLength: z.number().int().positive().max(4000),
        /** Số món tối đa đính kèm vào một thư người chơi. */
        maxAttachmentItems: z.number().int().positive(),
        /** Mỗi người gửi tối đa `limit` thư / `windowSeconds` giây. */
        sendRateLimit: z.object({
            limit: z.number().int().positive(),
            windowSeconds: z.number().int().positive(),
        }),
        /** Trần giá COD (chỉ để chặn tràn số — người chơi tự đặt giá trong trần). */
        maxCodAmount: z.number().int().positive(),
        /** Số thư tối đa một lần `mailClaimAll`. */
        claimAllLimit: z.number().int().positive(),
    })
    .refine((config) => config.locales.includes(config.defaultLocale), {
        message: "defaultLocale must be one of locales",
        path: ["defaultLocale"],
    });
export type MailConfig = z.infer<typeof MailConfigSchema>;
