import { registerErrorCodes } from "@/core/response/error-code.js";

/** Mã lỗi riêng của mail (global room). Lỗi chung của item / ví (`INVENTORY_FULL`, `CURRENCY_NOT_ENOUGH`, `ITEM_LOCKED`...) dùng lại mã của item. */
export enum MailErrorCode {
    /** Không tìm thấy thư (không phải của bạn, đã bị xoá / thu hồi hoặc đã hết hạn). */
    MAIL_NOT_FOUND = "MAIL_NOT_FOUND",
    /** Không tìm thấy người chơi với tên đó (cũng trả khi người đó đã chặn bạn). */
    MAIL_TARGET_NOT_FOUND = "MAIL_TARGET_NOT_FOUND",
    /** Không thể gửi thư cho chính mình. */
    MAIL_SELF_TARGET = "MAIL_SELF_TARGET",
    /** Hộp thư của người nhận đã đầy. */
    MAIL_TARGET_INBOX_FULL = "MAIL_TARGET_INBOX_FULL",
    /** Thư rỗng: không có tiêu đề, nội dung lẫn đính kèm. */
    MAIL_EMPTY = "MAIL_EMPTY",
    /** Tiêu đề quá dài. `error.maxLength` là số ký tự tối đa. */
    MAIL_SUBJECT_TOO_LONG = "MAIL_SUBJECT_TOO_LONG",
    /** Nội dung quá dài. `error.maxLength` là số ký tự tối đa. */
    MAIL_BODY_TOO_LONG = "MAIL_BODY_TOO_LONG",
    /** Đính kèm quá nhiều món. `error.max` là số món tối đa. */
    MAIL_TOO_MANY_ITEMS = "MAIL_TOO_MANY_ITEMS",
    /** Đính kèm bị lặp (cùng một món / cùng một loại tiền xuất hiện hai lần). */
    MAIL_ATTACHMENT_DUPLICATE = "MAIL_ATTACHMENT_DUPLICATE",
    /** Thư đã được nhận (claim) rồi. */
    MAIL_ALREADY_CLAIMED = "MAIL_ALREADY_CLAIMED",
    /** Thư không có đính kèm để nhận. */
    MAIL_NO_ATTACHMENT = "MAIL_NO_ATTACHMENT",
    /** Thư đã hết hạn. */
    MAIL_EXPIRED = "MAIL_EXPIRED",
    /** Chưa xoá được: thư chưa đọc, hoặc còn đính kèm chưa nhận (thư COD chưa nhận phải nhận hoặc trả lại). */
    MAIL_NOT_DELETABLE = "MAIL_NOT_DELETABLE",
    /** Thư này không trả lại được (thư hệ thống, hoặc đã nhận rồi). */
    MAIL_NOT_RETURNABLE = "MAIL_NOT_RETURNABLE",
    /** Giá COD chỉ đặt được cho thư có đính kèm. */
    MAIL_COD_NO_ATTACHMENT = "MAIL_COD_NO_ATTACHMENT",
    /** Giá COD vượt mức cho phép. `error.max` là giá tối đa. */
    MAIL_COD_TOO_HIGH = "MAIL_COD_TOO_HIGH",
    /** Thư COD phải nhận từng thư (`mailClaim`), không nhận hàng loạt. */
    MAIL_COD_REQUIRES_PAYMENT = "MAIL_COD_REQUIRES_PAYMENT",
}

registerErrorCodes(MailErrorCode);
