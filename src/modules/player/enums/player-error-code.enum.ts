import { registerErrorCodes } from "@/core/response/error-code.js";

/** Mã lỗi nhân vật, class và điểm tiềm năng. */
export enum PlayerErrorCode {
    /** Tên nhân vật đã có người dùng. Chọn tên khác. */
    PLAYER_NAME_EXISTS = "PLAYER_NAME_EXISTS",
    /** Không tìm thấy nhân vật (hoặc không thuộc tài khoản này). */
    PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND",
    /** Nhân vật đang bị khoá. */
    PLAYER_BANNED = "PLAYER_BANNED",
    /** Đã có nhân vật. */
    PLAYER_ALREADY_EXISTS = "PLAYER_ALREADY_EXISTS",
    /** Đã đạt số nhân vật tối đa của tài khoản. */
    PLAYER_LIMIT_REACHED = "PLAYER_LIMIT_REACHED",
    /** Tên không hợp lệ (độ dài theo master data `player_config`, chỉ chữ/số/`_`). */
    PLAYER_NAME_INVALID = "PLAYER_NAME_INVALID",
    /** Class này không chọn được lúc tạo nhân vật (chỉ class khởi đầu tier 1). */
    CLASS_NOT_AVAILABLE = "CLASS_NOT_AVAILABLE",
    /** Nhân vật đang chết, chưa làm được. */
    PLAYER_DEAD = "PLAYER_DEAD",
    /** Người chơi không online. */
    PLAYER_OFFLINE = "PLAYER_OFFLINE",
    /** Chưa đủ level (trang bị / map / dungeon). */
    LEVEL_TOO_LOW = "LEVEL_TOO_LOW",
    /** Đứng quá xa đối tượng — đi lại gần. */
    TOO_FAR = "TOO_FAR",
    /** Chưa đủ điều kiện (quest, vật phẩm, level...) để tương tác. */
    REQUIREMENTS_NOT_MET = "REQUIREMENTS_NOT_MET",
    /** Không còn điểm tiềm năng để cộng. */
    ATTRIBUTE_NO_POINTS = "ATTRIBUTE_NO_POINTS",
    /** Số điểm muốn cộng vượt quá điểm hiện có. */
    ATTRIBUTE_POINTS_NOT_ENOUGH = "ATTRIBUTE_POINTS_NOT_ENOUGH",
    /** Người chơi đó không còn ở cùng map / không online. */
    PLAYER_NOT_HERE = "PLAYER_NOT_HERE",
}

registerErrorCodes(PlayerErrorCode, {
    PLAYER_NAME_EXISTS: 409,
    PLAYER_NOT_FOUND: 404,
    PLAYER_BANNED: 403,
    PLAYER_LIMIT_REACHED: 409,
});
