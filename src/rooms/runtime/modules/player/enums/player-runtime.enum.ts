/** Nhóm dữ liệu lưu của player — mỗi nhóm khớp một cụm cột của `player_states`. */
export enum PlayerDataGroup {
    WALLET = "wallet",
    BAG = "bag",
    PROGRESS = "progress",
    PLACE = "place",
}

/** Sự kiện runtime phát ra để room tự gửi push (runtime không biết gì về client). */
export enum PlayerRuntimeEvent {
    WALLET_CHANGED = "walletChanged",
    BAG_CHANGED = "bagChanged",
    /** Item vừa được cộng vào túi (kèm kết quả: túi đầy / sắp đầy) — để global báo client. */
    BAG_GRANTED = "bagGranted",
    /** Vị trí world của player đổi (vào world / đổi map / rời). `detail` là `PresenceChange`. */
    PRESENCE_CHANGED = "presenceChanged",
    /** Party của player đổi (vào / rời / đổi cách chia loot). */
    PARTY_CHANGED = "partyChanged",
    /** Player đổi tên giữa phiên (`runtime.name` đã là tên mới) — mỗi room tự cập nhật state / báo client của mình. */
    RENAMED = "renamed",
}
