/**
 * Diện mạo cổng chắn của chamber dungeon (cổng vào sau lưng và cổng ra phía trước, khoá tới khi dọn hết quái).
 * Mỗi dungeon chọn một code trong định nghĩa; client map code sang prefab. Thêm code → `yarn config:export`.
 */
export enum GateCode {
    SLIME_GATE = "slime_gate",
    WEREWOLF_GATE = "werewolf_gate",
    SANCTUARY_GATE = "sanctuary_gate",
}
