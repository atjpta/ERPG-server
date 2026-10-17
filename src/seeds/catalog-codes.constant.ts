import { GameServerCode } from "@/modules/auth/enums/game-server-code.enum.js";
import { ClassCode } from "@/modules/classes/enums/class-code.enum.js";
import { DialogueCode } from "@/modules/dialogues/enums/dialogue-code.enum.js";
import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { GateCode } from "@/modules/maps/enums/gate-code.enum.js";
import { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import { MapCode } from "@/modules/maps/enums/map-code.enum.js";
import { MonsterCode } from "@/modules/monsters/enums/monster-code.enum.js";
import { NpcCode } from "@/modules/npcs/enums/npc-code.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { QuestCode } from "@/modules/quests/enums/quest-code.enum.js";
import { SkillCode } from "@/modules/skills/enums/skill-code.enum.js";

/** Shared source for Unity dropdowns and C# string constants. */
export const CATALOG_CODES = {
    gameServers: GameServerCode,
    classes: ClassCode,
    dialogues: DialogueCode,
    items: ItemCode,
    maps: MapCode,
    monsters: MonsterCode,
    npcs: NpcCode,
    quests: QuestCode,
    skills: SkillCode,
    currencies: CurrencyCode,
    gates: GateCode,
    interactables: InteractableCode,
} as const;
