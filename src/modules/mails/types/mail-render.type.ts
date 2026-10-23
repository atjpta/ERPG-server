import type { MailText } from "@/modules/mails/schemas/mail-content.schema.js";

/** Nội dung của thư hệ thống ở một ngôn ngữ, đã thay `{param}`. */
export interface MailTextVariant extends MailText {
    locale: string;
}
