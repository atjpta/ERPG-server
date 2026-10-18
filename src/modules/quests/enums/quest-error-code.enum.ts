import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi quest. */
export enum QuestErrorCode {
    QUEST_CODE_EXISTS = "QUEST_CODE_EXISTS",
    QUEST_NOT_FOUND = "QUEST_NOT_FOUND",
    QUEST_NOT_ACTIVE = "QUEST_NOT_ACTIVE",
    QUEST_NOT_AVAILABLE = "QUEST_NOT_AVAILABLE",
    QUEST_NOT_COMPLETED = "QUEST_NOT_COMPLETED",
    QUEST_CANNOT_ABANDON = "QUEST_CANNOT_ABANDON",
    QUEST_WRONG_NPC = "QUEST_WRONG_NPC",
}

registerErrorCodes(QuestErrorCode);
