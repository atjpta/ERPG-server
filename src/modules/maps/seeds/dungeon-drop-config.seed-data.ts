import type { DungeonDropConfig } from "@/modules/maps/schemas/dungeon-drop.schema.js";

/**
 * Mặc định master data `dungeon_drop_config` — chỉnh qua seed hoặc `PUT /admin/master-data/dungeon_drop_config`.
 * Chỉ là thưởng **thêm khi hạ boss** của từng dungeon; quái thường trong dungeon rớt như bình thường.
 */
export const DEFAULT_DUNGEON_DROP_CONFIG: DungeonDropConfig = {
    byMap: {
        slime_hollow: {
            expMultiplier: 1.5,
            goldMultiplier: 1.5,
            dropRateMultiplier: 1.5,
            extraItems: [{ itemCode: "spirit", min: 1, max: 2, rate: 1 }],
        },
        werewolf_den: {
            expMultiplier: 1.5,
            goldMultiplier: 1.5,
            dropRateMultiplier: 1.5,
            extraItems: [{ itemCode: "spirit", min: 2, max: 3, rate: 1 }],
        },
        sanctuary_of_life: {
            expMultiplier: 1.5,
            goldMultiplier: 1.5,
            dropRateMultiplier: 1.5,
            extraItems: [{ itemCode: "spirit", min: 3, max: 5, rate: 1 }],
        },
    },
};
