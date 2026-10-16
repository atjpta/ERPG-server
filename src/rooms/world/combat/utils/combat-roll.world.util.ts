import { big, type Big } from "@/core/utils/big-number.util.js";

/**
 * Random tất định cho combat: cùng `seed` → cùng kết quả, không dùng `Math.random()`. Seed ghép từ
 * id người đánh + số thứ tự đòn + thứ tự hit event + id mục tiêu, nên client có thể tính ra đúng
 * kết quả trúng/trượt/chí mạng như server (bản C# phải dùng cùng FNV-1a 32-bit trên UTF-8).
 */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UINT32_RANGE = 0x1_0000_0000;

export function fnv1a32(text: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (const byte of new TextEncoder().encode(text)) {
        hash ^= byte;
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
}

/** Số trong [0, 1) cho một lần roll; `salt` tách các lần roll khác nhau trên cùng seed. */
export const combatRoll = (seed: string, salt: string): Big =>
    big(fnv1a32(`${seed}:${salt}`)).div(UINT32_RANGE);

export const combatSeed = (
    attackerId: string,
    attackSerial: number,
    eventIndex: number,
    defenderId: string
): string => `${attackerId}:${attackSerial}:${eventIndex}:${defenderId}`;
