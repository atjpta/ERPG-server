import type { NewNpc } from "@/modules/npcs/entities/npc.entity.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { questDialogueRules } from "@/modules/quests/seeds/quest-content.js";

/** NPC — vị trí đặt trong file map, 1 NPC có thể có mặt ở nhiều map. Rule thoại quest sinh từ `quest-content`. */
export const NPCS: NewNpc[] = [
    // ---- Greenfield Village --------------------------------------------------------------------------
    // Trưởng làng: cốt truyện hero.
    {
        code: "village_chief",
        defaultDialogueCode: "elder_default",
        dialogueRules: questDialogueRules("village_chief"),
    },
    // Nhân viên hội: hero + nhiệm vụ hằng ngày (bảng nhiệm vụ).
    {
        code: "guild_officer",
        defaultDialogueCode: "guild_officer_default",
        dialogueRules: questDialogueRules("guild_officer"),
        functions: [{ id: "quest_board", type: NpcFunctionType.QUEST_BOARD, config: {} }],
    },
    { code: "swordsman_trainer", defaultDialogueCode: "swordsman_trainer_default" },
    { code: "archer_trainer", defaultDialogueCode: "archer_trainer_default" },
    { code: "cleric_trainer", defaultDialogueCode: "cleric_trainer_default" },
    // Nữ tu: hồi sinh / nhà thờ.
    { code: "village_priestess", defaultDialogueCode: "village_priestess_default" },
    // Thợ rèn: trang bị (cường hoá).
    {
        code: "blacksmith",
        defaultDialogueCode: "blacksmith_default",
        functions: [{ id: "enhance", type: NpcFunctionType.ENHANCE, config: {} }],
    },
    // Giả kim: tinh hoá (mở khoá bởi quest `strange_mana`).
    {
        code: "alchemist",
        defaultDialogueCode: "alchemist_default",
        functions: [{ id: "refine", type: NpcFunctionType.REFINE, config: {} }],
    },
    {
        code: "general_merchant",
        defaultDialogueCode: "general_merchant_default",
        functions: [{ id: "shop", type: NpcFunctionType.SHOP, config: { shop: "general_store" } }],
    },
    // Thợ săn: quest khu rừng.
    {
        code: "hunter_garrick",
        defaultDialogueCode: "garrick_default",
        dialogueRules: questDialogueRules("hunter_garrick"),
    },
    // Nhà nghiên cứu: cốt truyện mana + quest phụ.
    {
        code: "researcher",
        defaultDialogueCode: "researcher_default",
        dialogueRules: questDialogueRules("researcher"),
    },
    { code: "innkeeper", defaultDialogueCode: "innkeeper_default" },
    {
        code: "farmer_rowan",
        defaultDialogueCode: "rowan_default",
        dialogueRules: questDialogueRules("farmer_rowan"),
    },
    { code: "guard_captain", defaultDialogueCode: "guard_captain_default" },
    { code: "herbalist", defaultDialogueCode: "herbalist_default" },
];
