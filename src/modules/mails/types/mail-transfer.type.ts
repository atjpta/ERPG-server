import type { MailRow } from "@/modules/mails/entities/mail.entity.js";

/** Kết quả thu hồi / trả lại: thư gốc đã xoá và thư hoàn trả cho người gửi (đính kèm quay về). */
export interface MailReturnOutcome {
    deleted: MailRow;
    returned: MailRow | null;
}
