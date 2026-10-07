/** Trạng thái quest của 1 player — `ready` = đã đủ mục tiêu, chưa trả. */
export enum QuestState {
    NOT_STARTED = "not_started",
    ACTIVE = "active",
    READY = "ready",
    COMPLETED = "completed",
}

export enum QuestObjectiveType {
    /** Giết `count` monster có code = `targetCode`. */
    KILL = "kill",
    /** Có đủ `count` item `targetCode` trong túi (tính theo túi hiện tại, trả quest thì trừ). */
    COLLECT = "collect",
    /** Nói chuyện với NPC `targetCode` (action `talk` trong dialogue). */
    TALK = "talk",
    /** Tương tác với vật thể `targetCode` (id interactable). */
    INTERACT = "interact",
}

export enum QuestRepeat {
    NONE = "none",
    /** Làm lại được từ ngày kế tiếp. */
    DAILY = "daily",
    /** Làm lại ngay sau khi trả. */
    INFINITE = "infinite",
}
