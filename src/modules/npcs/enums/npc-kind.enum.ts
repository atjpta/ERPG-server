/**
 * Loại NPC. `npc`: nhân vật (có thoại, quest, marker, vùng chặn từ prefab Unity). `object`: vật thể đứng trong map
 * (cổng, bệ teleport, bảng thông báo, điểm thu thập...) — cùng luồng tương tác với NPC nhưng không có marker quest và không chặn đường.
 */
export enum NpcKind {
    NPC = "npc",
    OBJECT = "object",
}
