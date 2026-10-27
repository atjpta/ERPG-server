import { registerErrorCodes } from "@/core/response/error-code.js";

/** Mã lỗi riêng của chế tạo (global room). Thiếu nguyên liệu / tiền / chỗ túi dùng lại mã của item; chưa mở chức năng NPC dùng lại mã của NPC. */
export enum CraftingErrorCode {
    /** Không có công thức với code này (hoặc công thức đã bị tắt). */
    RECIPE_NOT_FOUND = "RECIPE_NOT_FOUND",
    /** Công thức không thuộc nhóm nào mà NPC đang mở chế được. Client chỉ nên hiện công thức thuộc nhóm của chức năng đang mở. */
    RECIPE_NOT_AVAILABLE = "RECIPE_NOT_AVAILABLE",
    /** Chế quá nhiều cái một lần. `error.max` là số cái tối đa mỗi lần. */
    CRAFT_QUANTITY_TOO_HIGH = "CRAFT_QUANTITY_TOO_HIGH",
}

registerErrorCodes(CraftingErrorCode);
