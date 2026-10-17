/** Chữ (kể cả tiếng Việt có dấu), số và `_`. */
export const PLAYER_NAME_PATTERN = /^[\p{L}\p{N}_]+$/u;

/** Độ dài tên tính theo ký tự (không theo UTF-16 code unit) — "Đạt" là 3. */
export const playerNameLength = (name: string) => [...name].length;

const PREFIXES = [
    "Ar",
    "Bel",
    "Cor",
    "Dra",
    "El",
    "Fen",
    "Gal",
    "Hel",
    "Ira",
    "Kai",
    "Lun",
    "Mor",
    "Nyx",
    "Or",
    "Ryn",
    "Sol",
    "Tal",
    "Vel",
    "Zan",
    "Aer",
    "Bryn",
    "Cael",
    "Dor",
    "Eld",
];
const SUFFIXES = [
    "dor",
    "wyn",
    "ric",
    "mir",
    "ra",
    "las",
    "vin",
    "eth",
    "ion",
    "os",
    "ara",
    "iel",
    "thas",
    "ius",
    "en",
    "ys",
    "gar",
    "dra",
    "mon",
    "is",
    "ane",
    "orn",
    "el",
];

/**
 * Tên ngẫu nhiên kiểu fantasy (Ar + dor → "Ardor") trong khoảng [minLength, maxLength]; `attempt` > 0
 * (tên vừa sinh đã có người dùng) thì thêm số phía sau cho dễ trùng ít hơn, vẫn giữ độ dài tối đa.
 */
export function randomPlayerName(params: {
    minLength: number;
    maxLength: number;
    attempt?: number;
    rng?: () => number;
}): string {
    const { minLength, maxLength, attempt = 0, rng = Math.random } = params;
    const pick = (list: readonly string[]) => list[Math.floor(rng() * list.length)];

    let name = pick(PREFIXES) + pick(SUFFIXES);
    while (playerNameLength(name) < minLength) name += pick(SUFFIXES);
    if (attempt > 0) {
        const digits = String(Math.floor(rng() * 10 ** Math.min(4, attempt + 1)));
        name = name.slice(0, Math.max(1, maxLength - digits.length)) + digits;
    }
    return [...name].slice(0, maxLength).join("");
}
