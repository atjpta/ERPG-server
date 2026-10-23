import type { CalcValue } from "@/core/calc/calc.interface.js";

/** Hệ số thưởng của monster (loại × độ hiếm) — `monster_scale_config`. */
export interface RewardScale {
    exp: CalcValue;
    gold: CalcValue;
    dropRate: CalcValue;
}
