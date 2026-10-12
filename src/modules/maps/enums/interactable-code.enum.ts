/**
 * Loại vật thể tương tác (diện mạo) — client map mỗi code sang một prefab riêng. Khác `type` (portal/teleport/gather/sign):
 * `type` là hành vi, `code` là hình dạng (bảng thông báo và cổng khoá đều là `sign` nhưng khác code).
 * Thêm code ở đây → `yarn config:export` → Unity thấy trong dropdown của marker và bảng prefab.
 */
export enum InteractableCode {
    ENTRY_DUNGEON = "entry_dungeon",
    NOTICE_BOARD = "notice_board",
    PORTAL = "portal",
    TELEPORT = "teleport",
}
