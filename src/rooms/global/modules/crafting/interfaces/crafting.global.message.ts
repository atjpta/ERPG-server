import type { ItemRewardMessage } from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";

/* DTO chế tạo gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

/** Kết quả một lần chế tạo. Chi tiết thay đổi của túi vẫn đến qua `inventoryChanged`. */
export interface CraftResultMessage {
    recipeCode: string;
    /** Số lần đã chế (cùng `quantity` của request). */
    quantity: number;
    /** Những gì đã vào túi: item xếp chồng gộp một dòng; mỗi trang bị một dòng kèm `metadata` (chỉ số). */
    items: ItemRewardMessage[];
}
