/** 4 class khởi đầu (tier 1) — người chơi chọn 1 class lúc tạo nhân vật. */
export const STARTER_CLASS_CODES = ["guardian", "swordman", "archer", "mage"] as const;

export type StarterClassCode = (typeof STARTER_CLASS_CODES)[number];
