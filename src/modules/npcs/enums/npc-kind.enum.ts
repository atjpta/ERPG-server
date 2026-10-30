/**
 * Loại NPC. `npc`: nhân vật (có thoại, quest, marker). `object`: vật thể đứng trong map
 * (cổng, bệ teleport, bảng thông báo, điểm thu thập...) — cùng luồng tương tác với NPC nhưng không có marker quest. NPC và vật thể đều không có hitbox / collider.
 */
export enum NpcKind {
    NPC = "npc",
    OBJECT = "object",
}
