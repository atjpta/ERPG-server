import { readdirSync, readFileSync } from "node:fs";
import { CATALOG_CODES } from "@/seeds/catalog-codes.constant.js";
import { SERVERS } from "@/modules/auth/seeds/game-server.seed-data.js";
import { CLASSES } from "@/modules/classes/seeds/class.seed-data.js";
import { DIALOGUES } from "@/modules/dialogues/seeds/dialogue.seed-data.js";
import { ITEMS } from "@/modules/items/seeds/item.seed-data.js";
import { NPCS } from "@/modules/npcs/seeds/npc.seed-data.js";
import { DAILY_QUEST_CODES } from "@/modules/quests/schemas/daily-quest.schema.js";
import { QUESTS } from "@/modules/quests/seeds/quest.seed-data.js";

const fileCodes = (directory: URL, suffix: string): string[] =>
    readdirSync(directory)
        .filter((file) => file.endsWith(suffix))
        .map((file) => JSON.parse(readFileSync(new URL(file, directory), "utf8")).code);

export function assertCatalogCodeList(
    kind: string,
    codes: readonly string[],
    members: readonly string[],
    requireAuthoredData = true
): void {
    const missing = codes.filter((code) => !members.includes(code));
    const stale = requireAuthoredData ? members.filter((code) => !codes.includes(code)) : [];
    if (new Set(codes).size !== codes.length || new Set(members).size !== members.length) {
        throw new Error(`[CatalogCodes] ${kind}: duplicate codes`);
    }
    if (missing.length || stale.length) {
        throw new Error(
            `[CatalogCodes] ${kind}: missing enum codes [${missing.join(", ")}]; missing authoring data [${stale.join(", ")}]. Update the code enum and run yarn codes:generate.`
        );
    }
}

/** Seed requires complete data; code sync also permits server codes awaiting Unity authoring. */
export function checkCatalogCodes(requireAuthoredData = true): void {
    const authored = {
        gameServers: SERVERS.map((row) => row.code),
        classes: CLASSES.map((row) => row.code),
        dialogues: DIALOGUES.map((row) => row.code),
        items: ITEMS.map((row) => row.code),
        maps: fileCodes(new URL("../modules/maps/data/definitions/", import.meta.url), ".json"),
        monsters: fileCodes(new URL("../modules/monsters/data/", import.meta.url), ".monster.json"),
        npcs: NPCS.map((row) => row.code),
        quests: [...QUESTS.map((row) => row.code), ...DAILY_QUEST_CODES],
        skills: fileCodes(new URL("../modules/skills/data/", import.meta.url), ".skill.json"),
    };
    for (const [kind, values] of Object.entries(authored)) {
        const codes: string[] = values;
        const members = Object.values(CATALOG_CODES[kind as keyof typeof authored]) as string[];
        assertCatalogCodeList(kind, codes, members, requireAuthoredData);
    }
}
