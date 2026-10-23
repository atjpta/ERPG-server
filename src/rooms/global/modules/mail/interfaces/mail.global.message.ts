import type { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { ItemRewardMessage } from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";

/* DTO mail gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

/** Một khoản tiền (đính kèm hoặc giá COD). */
export interface MailCurrencyMessage {
    code: CurrencyCode;
    amount: number;
}

/** Đính kèm của thư — cùng định dạng thưởng của quái rớt / quest. */
export interface MailRewardMessage {
    items: ItemRewardMessage[];
    currency: MailCurrencyMessage[];
}

/** Một thư trong hộp thư. */
export interface MailMessage {
    id: string;
    kind: MailKind;
    /** Người gửi (chỉ thư người chơi, và người đó còn tồn tại). */
    senderId?: string;
    /** Tên người gửi lúc gửi (thư người chơi). Thư hệ thống không có: client tự hiện "Hệ thống". */
    senderName?: string;
    /** Thư hệ thống: đã chọn ngôn ngữ (xem `locale`); thư người chơi: chữ người gửi viết. */
    subject: string;
    body: string;
    /** Ngôn ngữ thực sự dùng cho thư hệ thống (có thể khác ngôn ngữ yêu cầu do fallback). */
    locale: string;
    reward?: MailRewardMessage;
    /** Thư COD: phải trả khoản này mới nhận được `reward`. */
    cod?: MailCurrencyMessage;
    read: boolean;
    /** Đã nhận đính kèm. */
    claimed: boolean;
    /** Thời điểm gửi (epoch ms). */
    createdAt: number;
    /** Thời điểm hết hạn (epoch ms). */
    expiresAt: number;
}

/** `data` của response `mailList`. */
export interface MailListMessage {
    mails: MailMessage[];
    unreadCount: number;
    /** Ngôn ngữ đã dùng để dựng nội dung (server nhớ để push `mailReceived` đúng ngôn ngữ). */
    locale: string;
}

/** `data` của response `mailRead`. */
export interface MailReadMessage {
    unreadCount: number;
}

/** Một thư đã gửi mà người nhận chưa claim (thu hồi được bằng `mailRecall`). */
export interface MailSentEntryMessage {
    id: string;
    recipientId: string;
    recipientName: string;
    subject: string;
    reward?: MailRewardMessage;
    cod?: MailCurrencyMessage;
    /** Người nhận đã đọc chưa. */
    read: boolean;
    createdAt: number;
    expiresAt: number;
}

/** `data` của response `mailSentList`. */
export interface MailSentListMessage {
    mails: MailSentEntryMessage[];
}

/** `data` của response `mailSend`. */
export interface MailSendResultMessage {
    mailId: string;
    recipientName: string;
}

/** `data` của response `mailClaim`: những gì vừa nhận. */
export interface MailClaimedMessage {
    mailId: string;
    items: ItemRewardMessage[];
    currency: MailCurrencyMessage[];
}

/** `data` của response `mailClaimAll`. */
export interface MailClaimAllMessage {
    claimed: MailClaimedMessage[];
    /** Số thư COD bị bỏ qua (phải nhận từng thư bằng `mailClaim`). */
    skippedCod: number;
    /** Mã lỗi khiến việc nhận dừng giữa chừng (`INVENTORY_FULL`, `MAIL_NEEDS_WORLD`); không có nghĩa là nhận hết. */
    stoppedBy?: string;
}

/** `data` của response `mailDeleteRead`. */
export interface MailDeletedMessage {
    mailIds: string[];
}

/** `data` của `GlobalMessage.MAIL_RECEIVED`: thư mới tới (quà, thư người chơi, thư hoàn trả, thanh toán COD). */
export interface MailReceivedMessage {
    mail: MailMessage;
    unreadCount: number;
}

/** `data` của `GlobalMessage.MAIL_REMOVED`: thư biến khỏi hộp thư (người gửi thu hồi). */
export interface MailRemovedMessage {
    mailId: string;
}
