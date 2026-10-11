import type { DungeonDropConfig } from "@/modules/maps/schemas/dungeon-drop.schema.js";

/**
 * Mặc định master data `dungeon_drop_config` — chỉnh qua seed hoặc `PUT /admin/master-data/dungeon_drop_config`.
 * Hầm ngục thưởng nhỉnh hơn field cùng cấp; boss có thêm tinh linh.
 */
export const DEFAULT_DUNGEON_DROP_CONFIG: DungeonDropConfig = {
    byMap: {
        slime_hollow: {
            expMultiplier: 1.5,
            goldMultiplier: 1.5,
            dropRateMultiplier: 1.5,
            extraItems: [{ itemCode: "spirit", min: 1, max: 2, rate: 1, bossOnly: true }],
        },
        werewolf_den: {
            expMultiplier: 1.5,
            goldMultiplier: 1.5,
            dropRateMultiplier: 1.5,
            extraItems: [{ itemCode: "spirit", min: 2, max: 3, rate: 1, bossOnly: true }],
        },
        sanctuary_of_life: {
            expMultiplier: 1.5,
            goldMultiplier: 1.5,
            dropRateMultiplier: 1.5,
            extraItems: [{ itemCode: "spirit", min: 3, max: 5, rate: 1, bossOnly: true }],
        },
    },
};
