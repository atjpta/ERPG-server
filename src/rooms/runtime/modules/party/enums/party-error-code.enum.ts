import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi riêng của party (global room). */
export enum PartyErrorCode {
    /** Không có lời mời party còn hạn (hết hạn hoặc đã bị huỷ). */
    PARTY_NO_INVITE = "PARTY_NO_INVITE",
    /** Chỉ chủ party làm được thao tác này. */
    PARTY_NOT_LEADER = "PARTY_NOT_LEADER",
    /** Party đã đủ người. */
    PARTY_FULL = "PARTY_FULL",
    /** Không thể áp dụng lên chính mình. */
    PARTY_SELF_TARGET = "PARTY_SELF_TARGET",
    /** Đã là thành viên của party. */
    PARTY_ALREADY_MEMBER = "PARTY_ALREADY_MEMBER",
    /** Người đó không phải thành viên của party. */
    PARTY_NOT_MEMBER = "PARTY_NOT_MEMBER",
    /** Đang có quá nhiều lời mời chưa trả lời — đợi hết hạn. */
    PARTY_INVITE_LIMIT = "PARTY_INVITE_LIMIT",
    /** Không tìm thấy người chơi online với tên đó. */
    PARTY_TARGET_NOT_FOUND = "PARTY_TARGET_NOT_FOUND",
    /** Người đó đang offline hoặc đang chuyển map (chưa vào world room). */
    PARTY_TARGET_OFFLINE = "PARTY_TARGET_OFFLINE",
    /** Người đó đã ở trong một party khác. */
    PARTY_TARGET_IN_PARTY = "PARTY_TARGET_IN_PARTY",
    /** Người đó không ở trong party nào để xin vào. */
    PARTY_TARGET_NOT_IN_PARTY = "PARTY_TARGET_NOT_IN_PARTY",
}

registerErrorCodes(PartyErrorCode);
