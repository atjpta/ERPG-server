export interface PlayerBaseStats {
    maxHp: number;
    maxMp: number;
    attack: number;
    defense: number;
    /** Tốc độ di chuyển — đơn vị tile/giây. */
    moveSpeed: number;
}

/** Chỉ số gốc cấp 1 — tạm hard-code, chuyển sang master-data khi có hệ thống level/stat. */
export const PLAYER_BASE_STATS: PlayerBaseStats = {
    maxHp: 120,
    maxMp: 50,
    attack: 12,
    defense: 6,
    moveSpeed: 4,
};

/** Skill (theo code) gán cho player mới, đúng thứ tự combo đánh thường. */
export const PLAYER_DEFAULT_SKILL_CODES = [
    "swordman_slash_1",
    "swordman_slash_2",
    "swordman_slash_3",
] as const;
