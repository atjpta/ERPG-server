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
    /** Clear dungeon có map code = `targetCode` (hạ boss chamber cuối). */
    CLEAR_DUNGEON = "clear_dungeon",
}

/** Loại quest — client tô màu: hero đỏ, side vàng, daily xanh lá. */
export enum QuestCategory {
    /** Nhiệm vụ anh hùng theo cốt truyện, mở khoá chức năng. */
    HERO = "hero",
    /** Nhiệm vụ phụ. */
    SIDE = "side",
    /** Nhiệm vụ hằng ngày — sinh động mỗi ngày, không nằm trong bảng `quests`. */
    DAILY = "daily",
}

export enum QuestRepeat {
    NONE = "none",
    /** Làm lại được từ ngày kế tiếp. */
    DAILY = "daily",
    /** Làm lại ngay sau khi trả. */
    INFINITE = "infinite",
}
