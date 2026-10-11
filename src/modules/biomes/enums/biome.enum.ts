/** Vùng quái — mỗi biome có bộ trang bị (set) riêng theo class rơi từ quái của biome đó. */
export enum Biome {
    /** Đồ tân thủ: tặng lúc tạo nhân vật, không rơi, không có set bonus. */
    STARTER = "starter",
    /** Set lv10 — Slime, Bat. */
    SLIME = "slime",
    /** Set lv20 — Werewolf. */
    WEREWOLF = "werewolf",
    /** Set lv30 — Werebear. */
    WEREBEAR = "werebear",
}

/** Level trang bị của set từng biome (rơi từ quái của biome đó). */
export const BIOME_EQUIPMENT_LEVEL: Record<Exclude<Biome, Biome.STARTER>, number> = {
    [Biome.SLIME]: 10,
    [Biome.WEREWOLF]: 20,
    [Biome.WEREBEAR]: 30,
};
