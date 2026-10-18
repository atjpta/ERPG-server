import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi quest. */
export enum QuestErrorCode {
    /** Mã quest đã tồn tại (admin). */
    QUEST_CODE_EXISTS = "QUEST_CODE_EXISTS",
    /** Quest không tồn tại. */
    QUEST_NOT_FOUND = "QUEST_NOT_FOUND",
    /** Quest không ở trạng thái đang làm. */
    QUEST_NOT_ACTIVE = "QUEST_NOT_ACTIVE",
    /** Quest chưa nhận được (chưa đủ điều kiện hoặc đã làm). */
    QUEST_NOT_AVAILABLE = "QUEST_NOT_AVAILABLE",
    /** Quest chưa hoàn thành mục tiêu. */
    QUEST_NOT_COMPLETED = "QUEST_NOT_COMPLETED",
    /** Quest này không cho bỏ. */
    QUEST_CANNOT_ABANDON = "QUEST_CANNOT_ABANDON",
    /** Không phải NPC giao / trả quest này. */
    QUEST_WRONG_NPC = "QUEST_WRONG_NPC",
}

registerErrorCodes(QuestErrorCode);
