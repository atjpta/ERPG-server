import { ClassCode } from "@/modules/classes/enums/class-code.enum.js";
/** 3 class khởi đầu (tier 1) — người chơi chọn 1 class lúc tạo nhân vật. */
export const STARTER_CLASS_CODES = [
    ClassCode.SWORDSMAN,
    ClassCode.ARCHER,
    ClassCode.CLERIC,
] as const;

export type StarterClassCode = (typeof STARTER_CLASS_CODES)[number];
