import { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailTemplateRepo } from "@/modules/mails/repositories/mail-template.repository.js";
import type { MailParams } from "@/modules/mails/schemas/mail-content.schema.js";
import type { MailTextVariant } from "@/modules/mails/types/mail-render.type.js";

/**
 * Dựng nội dung thư hệ thống: **mọi ngôn ngữ** có trong thư / mẫu, đã thay `{param}`. Server không chọn ngôn ngữ — client tự lấy bản đúng
 * với ngôn ngữ của nó (và tự fallback). Thư người chơi không có biến thể (chữ do người gửi viết).
 */
export class MailRenderService {
    interpolate(text: string, params?: MailParams | null): string {
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (match, key: string) =>
            key in params ? String(params[key]) : match
        );
    }

    /** Dựng nội dung cho nhiều thư (tải các mẫu thư cần dùng một lần). Key là `mail.id`. */
    async renderMany(rows: readonly MailRow[]): Promise<Map<string, MailTextVariant[]>> {
        const codes = [
            ...new Set(rows.flatMap((row) => (row.templateCode ? [row.templateCode] : []))),
        ];
        const templates = new Map(
            (await MailTemplateRepo.findByCodes({ codes })).map((template) => [
                template.code,
                template.content,
            ])
        );
        const rendered = new Map<string, MailTextVariant[]>();
        for (const row of rows) {
            if (row.kind === MailKind.PLAYER) {
                rendered.set(row.id, []);
                continue;
            }
            const content =
                row.content ?? (row.templateCode ? templates.get(row.templateCode) : undefined);
            rendered.set(
                row.id,
                Object.entries(content ?? {}).map(([locale, text]) => ({
                    locale,
                    subject: this.interpolate(text.subject, row.params),
                    body: this.interpolate(text.body, row.params),
                }))
            );
        }
        return rendered;
    }
}

export const mailRenderService = new MailRenderService();
