import { MailTemplates } from "@/modules/mails/entities/mail-template.entity.js";
import { MailTemplateRepo } from "@/modules/mails/repositories/mail-template.repository.js";
import {
    MailContentSchema,
    type MailContent,
} from "@/modules/mails/schemas/mail-content.schema.js";

interface MailTemplateSeedData {
    code: string;
    note: string;
    content: MailContent;
}

/**
 * Mẫu thư hệ thống (vi + en). `{param}` được thay bằng `params` của thư. Thêm mẫu mới: thêm vào đây rồi `yarn seed`;
 * thiếu một ngôn ngữ thì server fallback về `mail_config.defaultLocale` (xem `MailRenderService`).
 */
export const MAIL_TEMPLATES: MailTemplateSeedData[] = [
    {
        code: "gift_code",
        note: "Quà từ mã quà tặng (gift code). Đính kèm trong `reward`.",
        content: {
            vi: {
                subject: "Quà tặng",
                body: "Bạn nhận được phần thưởng từ mã quà tặng. Hãy nhận quà đính kèm nhé!",
            },
            en: {
                subject: "Gift",
                body: "You received a reward from a gift code. Claim the attachment!",
            },
        },
    },
    {
        code: "system_notice",
        note: "Thông báo hệ thống chung; nội dung truyền qua params.message.",
        content: {
            vi: { subject: "Thông báo hệ thống", body: "{message}" },
            en: { subject: "System notice", body: "{message}" },
        },
    },
    {
        code: "mail_returned",
        note: "Đính kèm của thư đã gửi được trả lại (thu hồi, bị từ chối hoặc hết hạn). params.recipient = tên người nhận.",
        content: {
            vi: {
                subject: "Thư được hoàn trả",
                body: "Vật phẩm đính kèm của thư gửi tới {recipient} đã được trả lại cho bạn.",
            },
            en: {
                subject: "Mail returned",
                body: "The attachment of your mail to {recipient} has been returned to you.",
            },
        },
    },
    {
        code: "cod_payment",
        note: "Tiền thanh toán thư COD gửi cho người gửi. params.recipient = tên người đã trả.",
        content: {
            vi: {
                subject: "Thanh toán thư COD",
                body: "{recipient} đã nhận hàng và thanh toán cho bạn.",
            },
            en: {
                subject: "COD payment",
                body: "{recipient} received your parcel and paid you.",
            },
        },
    },
];

export const MailTemplateSeed = async () => {
    for (const template of MAIL_TEMPLATES) {
        const data = { ...template, content: MailContentSchema.parse(template.content) };
        await MailTemplateRepo.upsert({
            data,
            target: MailTemplates.code,
            matchValue: template.code,
            updateData: data,
        });
    }
    console.info("✅ [MailTemplateSeed] Done");
};
