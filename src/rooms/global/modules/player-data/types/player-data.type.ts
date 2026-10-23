import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";

/** Phần dữ liệu world làm chủ mà thao tác của global cần đọc / sửa trong bản nháp (level để mặc đồ, ví để trả phí). */
export type PlayerWorldView = Pick<PlayerSavedState, "level" | "wallet">;
