import type { MailContent, MailParams } from "@/modules/mails/schemas/mail-content.schema.js";

/** Nội dung của thư / broadcast hệ thống: mẫu thư (+ `params`) hoặc nội dung đa ngôn ngữ viết thẳng. */
export interface SystemMailContent {
    templateCode?: string;
    params?: MailParams;
    content?: MailContent;
}
