import { registerErrorCodes } from "@/core/utils/error-code.util.js";

/** Mã lỗi túi đồ, item, trang bị và tiền tệ. */
export enum ItemErrorCode {
    /** Túi đầy, không còn ô trống cho thao tác này. */
    INVENTORY_FULL = "INVENTORY_FULL",
    /** Ô túi / ô trang bị không hợp lệ (ngoài phạm vi, hoặc món không đặt được vào ô đó). */
    INVENTORY_SLOT_INVALID = "INVENTORY_SLOT_INVALID",
    /** Ô được chọn đang trống. */
    INVENTORY_SLOT_EMPTY = "INVENTORY_SLOT_EMPTY",
    /** Không tìm thấy món đồ (instanceId sai hoặc đã đổi chỗ). Client làm mới túi. */
    ITEM_NOT_FOUND = "ITEM_NOT_FOUND",
    /** Không đủ số lượng vật phẩm / nguyên liệu cần. */
    ITEM_NOT_ENOUGH = "ITEM_NOT_ENOUGH",
    /** Món này không dùng trực tiếp được. */
    ITEM_NOT_USABLE = "ITEM_NOT_USABLE",
    /** Món này không phải trang bị. */
    ITEM_NOT_EQUIPMENT = "ITEM_NOT_EQUIPMENT",
    /** Món đang bị khoá — mở khoá trước khi phân rã. */
    ITEM_LOCKED = "ITEM_LOCKED",
    /** Trang bị không dành cho class của nhân vật. */
    ITEM_CLASS_MISMATCH = "ITEM_CLASS_MISMATCH",
    /** Vật phẩm đang hồi (cooldown), chưa dùng lại được. */
    ITEM_ON_COOLDOWN = "ITEM_ON_COOLDOWN",
    /** HP / MP đã đầy, không cần dùng bình. */
    ITEM_ALREADY_FULL = "ITEM_ALREADY_FULL",
    /** Không đủ tiền tệ (vàng, bụi...). */
    CURRENCY_NOT_ENOUGH = "CURRENCY_NOT_ENOUGH",
    /** Không tìm thấy trang bị (trong túi hoặc đang mặc). */
    EQUIPMENT_NOT_FOUND = "EQUIPMENT_NOT_FOUND",
    /** Thiếu cấu hình cường hoá / tinh hoá cho món này (lỗi dữ liệu server). */
    EQUIPMENT_CONFIG_MISSING = "EQUIPMENT_CONFIG_MISSING",
    /** Đã cường hoá tối đa ở rarity hiện tại — cần tinh hoá. */
    EQUIPMENT_MAX_ENHANCE = "EQUIPMENT_MAX_ENHANCE",
    /** Cần tinh hoá lên rarity kế tiếp trước khi cường hoá tiếp. */
    EQUIPMENT_NEEDS_REFINE = "EQUIPMENT_NEEDS_REFINE",
    /** Đã đạt rarity cao nhất, không tinh hoá thêm được. */
    EQUIPMENT_MAX_RARITY = "EQUIPMENT_MAX_RARITY",
}

registerErrorCodes(ItemErrorCode);
