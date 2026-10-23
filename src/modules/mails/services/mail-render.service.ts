import { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";
import type { MailRow } from "@/modules/mails/entities/mail.entity.js";
import { MailTemplateRepo } from "@/modules/mails/repositories/mail-template.repository.js";
import type {
    MailContent,
    MailParams,
    MailText,
} from "@/modules/mails/schemas/mail-content.schema.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";

/** Tiêu đề + nội dung đã chọn ngôn ngữ; `locale` là ngôn ngữ thực sự dùng (có thể khác ngôn ngữ yêu cầu do fallback). */
export interface RenderedMail extends MailText {
    locale: string;
}

/** Dựng nội dung hiển thị của thư: chọn ngôn ngữ (có fallback) và thay `{param}`. */
export class MailRenderService {
    /** Thứ tự thử: ngôn ngữ yêu cầu → mặc định → `en` → ngôn ngữ đầu tiên có trong nội dung. */
    localeChain(requested?: string): string[] {
        const { defaultLocale } = masterDataCacheService.get(MasterDataKey.MAIL_CONFIG);
        return [
            ...new Set([requested, defaultLocale, "en"].filter((code): code is string => !!code)),
        ];
    }

    pick(content: MailContent, requested?: string): RenderedMail | undefined {
        for (const locale of this.localeChain(requested)) {
            const text = content[locale];
            if (text) return { ...text, locale };
        }
        const [locale, text] = Object.entries(content)[0] ?? [];
        return text ? { ...text, locale } : undefined;
    }

    interpolate(text: string, params?: MailParams | null): string {
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (match, key: string) =>
            key in params ? String(params[key]) : match
        );
    }

    /** Dựng nội dung cho nhiều thư (tải các mẫu thư cần dùng một lần). Key là `mail.id`. */
    async renderMany(
        rows: readonly MailRow[],
        requested?: string
    ): Promise<Map<string, RenderedMail>> {
        const codes = [
            ...new Set(rows.flatMap((row) => (row.templateCode ? [row.templateCode] : []))),
        ];
        const templates = new Map(
            (await MailTemplateRepo.findByCodes({ codes })).map((template) => [
                template.code,
                template.content,
            ])
        );
        const fallback = this.localeChain(requested)[0];
        const rendered = new Map<string, RenderedMail>();
        for (const row of rows) {
            if (row.kind === MailKind.PLAYER) {
                rendered.set(row.id, {
                    subject: row.subject ?? "",
                    body: row.body ?? "",
                    locale: fallback,
                });
                continue;
            }
            const content =
                row.content ?? (row.templateCode ? templates.get(row.templateCode) : undefined);
            const text = content ? this.pick(content, requested) : undefined;
            rendered.set(row.id, {
                subject: text ? this.interpolate(text.subject, row.params) : "",
                body: text ? this.interpolate(text.body, row.params) : "",
                locale: text?.locale ?? fallback,
            });
        }
        return rendered;
    }
}

export const mailRenderService = new MailRenderService();
