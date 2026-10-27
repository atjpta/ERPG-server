import { db } from "@/configs/postgres.config.js";
import { RecipeGroups } from "@/modules/crafting/entities/recipe-group.entity.js";
import { Recipes } from "@/modules/crafting/entities/recipe.entity.js";
import { Dialogues } from "@/modules/dialogues/entities/dialogue.entity.js";
import { Items } from "@/modules/items/entities/item.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { loadMapDefinitions } from "@/modules/maps/seeds/game-map.seed.js";
import { Monsters } from "@/modules/monsters/entities/monster.entity.js";
import { Npcs } from "@/modules/npcs/entities/npc.entity.js";
import { Quests } from "@/modules/quests/entities/quest.entity.js";
import { findContentRefErrors } from "@/modules/quests/seeds/content-refs.seed-util.js";

/** Chạy sau mọi seed nội dung: tham chiếu code sai (NPC, item, quest, thoại...) thì dừng seed. */
export const ContentRefsCheck = async () => {
    const [npcs, dialogues, quests, items, monsters, recipes, recipeGroups] = await Promise.all([
        db.select().from(Npcs),
        db.select().from(Dialogues),
        db.select().from(Quests),
        db.select({ code: Items.code, type: Items.type }).from(Items),
        db.select({ code: Monsters.code }).from(Monsters),
        db.select().from(Recipes),
        db.select({ code: RecipeGroups.code }).from(RecipeGroups),
    ]);
    const errors = findContentRefErrors({
        maps: loadMapDefinitions(),
        npcs,
        dialogues,
        quests,
        itemCodes: new Set(items.map((item) => item.code)),
        itemTypes: new Map(items.map((item) => [item.code, item.type])),
        recipes,
        recipeGroups,
        monsterCodes: new Set(monsters.map((monster) => monster.code)),
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
