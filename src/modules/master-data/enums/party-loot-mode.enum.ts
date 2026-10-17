/** Cách chia item rơi khi đánh quái (chủ party đổi được). Vàng chia theo `shareGold`. */
export enum PartyLootMode {
    /** Người kết liễu nhận hết item. */
    KILLER = "killer",
    /** Luân phiên giữa các thành viên đủ điều kiện, mỗi item một người. */
    ROUND_ROBIN = "round_robin",
    /** Ngẫu nhiên một người đủ điều kiện cho mỗi item. */
    RANDOM = "random",
}
