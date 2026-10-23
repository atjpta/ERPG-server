/**
 * Dấu trên đầu NPC của riêng player (màu theo `category` của quest, xám khi chưa cần làm gì thêm):
 * - available `!` màu loại quest — có quest chưa nhận.
 * - talkTarget `!` xám — NPC là đích nói chuyện của quest đang làm.
 * - inProgress `?` xám — quest đang làm, trả ở NPC này.
 * - ready `?` màu loại quest — quest xong, đến trả.
 */
export enum NpcMarker {
    NONE = "none",
    AVAILABLE = "available",
    TALK_TARGET = "talkTarget",
    IN_PROGRESS = "inProgress",
    READY = "ready",
}
