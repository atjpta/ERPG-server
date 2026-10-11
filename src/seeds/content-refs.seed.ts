import { db } from "@/configs/postgres.config.js";
import { Dialogues } from "@/modules/dialogues/entities/dialogue.entity.js";
import { Items } from "@/modules/items/entities/item.entity.js";
import { DEFAULT_DUNGEON_DROP_CONFIG } from "@/modules/maps/seeds/dungeon-drop-config.seed-data.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { loadMapDefinitions } from "@/modules/maps/seeds/game-map.seed.js";
import { Monsters } from "@/modules/monsters/entities/monster.entity.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";
import { Quests } from "@/modules/quests/entities/quest.entity.js";
import { findContentRefErrors } from "@/modules/quests/utils/content-refs.util.js";

/** Chạy sau mọi seed nội dung: tham chiếu code sai (NPC, item, quest, thoại...) thì dừng seed. */
export const ContentRefsCheck = async () => {
    const [npcs, dialogues, quests, items, monsters] = await Promise.all([
        db.select().from(Npcs),
        db.select().from(Dialogues),
        db.select().from(Quests),
        db.select({ code: Items.code }).from(Items),
        db.select({ code: Monsters.code }).from(Monsters),
    ]);
    const errors = findContentRefErrors({
        maps: loadMapDefinitions(),
        npcs,
        dialogues,
        quests,
        itemCodes: new Set(items.map((item) => item.code)),
        monsterCodes: new Set(monsters.map((monster) => monster.code)),
        dungeonDrops: DEFAULT_DUNGEON_DROP_CONFIG,
        dungeonMapCodes: new Set(
            loadMapDefinitions()
                .filter((map) => map.type === MapType.DUNGEON)
                .map((map) => map.code)
        ),
    });
    if (errors.length > 0) {
        throw new Error(`[ContentRefsCheck]\n - ${errors.join("\n - ")}`);
    }
    console.info("✅ [ContentRefsCheck] Done");
};
