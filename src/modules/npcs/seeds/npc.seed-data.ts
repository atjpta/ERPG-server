import { NpcCode } from "@/modules/npcs/enums/npc-code.enum.js";
import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";
import type { NewNpc } from "@/modules/npcs/entities/npc.entity.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { DAILY_QUEST_CODES } from "@/modules/quests/schemas/daily-quest.schema.js";
import { questDialogueRules } from "@/modules/quests/seeds/quest-content.js";

/** NPC — vị trí đặt trong file map, 1 NPC có thể có mặt ở nhiều map. Rule thoại quest sinh từ `quest-content`. */
export const NPCS: NewNpc[] = [
    // ---- Greenfield Village --------------------------------------------------------------------------
    // Trưởng làng: cốt truyện hero.
    {
        code: NpcCode.VILLAGE_CHIEF,
        defaultDialogueCode: "elder_default",
        dialogueRules: questDialogueRules("village_chief"),
    },
    // Nhân viên hội: hero + nhiệm vụ hằng ngày (bảng nhiệm vụ).
    {
        code: NpcCode.GUILD_OFFICER,
        defaultDialogueCode: "guild_officer_default",
        dialogueRules: [
            ...questDialogueRules("guild_officer"),
            // Có quest hằng ngày xong → thoại nhận thưởng (thắng quest cốt truyện đang làm dở).
            ...DAILY_QUEST_CODES.map((questCode) => ({
                priority: 5000,
                conditions: [{ type: "quest_state" as const, questCode, state: QuestState.READY }],
                dialogueCode: "daily_claim",
            })),
        ],
        functions: [{ id: "quest_board", type: NpcFunctionType.QUEST_BOARD, config: {} }],
    },
    { code: NpcCode.SWORDSMAN_TRAINER, defaultDialogueCode: "swordsman_trainer_default" },
    { code: NpcCode.ARCHER_TRAINER, defaultDialogueCode: "archer_trainer_default" },
    { code: NpcCode.CLERIC_TRAINER, defaultDialogueCode: "cleric_trainer_default" },
    // Nữ tu: hồi sinh / nhà thờ.
    { code: NpcCode.VILLAGE_PRIESTESS, defaultDialogueCode: "village_priestess_default" },
    // Thợ rèn: trang bị (cường hoá).
    {
        code: NpcCode.BLACKSMITH,
        defaultDialogueCode: "blacksmith_default",
        functions: [{ id: "enhance", type: NpcFunctionType.ENHANCE, config: {} }],
    },
    // Giả kim: tinh hoá (mở khoá bởi quest `strange_mana`).
    {
        code: NpcCode.ALCHEMIST,
        defaultDialogueCode: "alchemist_default",
        functions: [{ id: "refine", type: NpcFunctionType.REFINE, config: {} }],
    },
    {
        code: NpcCode.GENERAL_MERCHANT,
        defaultDialogueCode: "general_merchant_default",
        functions: [{ id: "shop", type: NpcFunctionType.SHOP, config: { shop: "general_store" } }],
    },
    // Thợ săn: quest khu rừng.
    {
        code: NpcCode.HUNTER_GARRICK,
        defaultDialogueCode: "garrick_default",
        dialogueRules: questDialogueRules("hunter_garrick"),
    },
    // Nhà nghiên cứu: cốt truyện mana + quest phụ.
    {
        code: NpcCode.RESEARCHER,
        defaultDialogueCode: "researcher_default",
        dialogueRules: questDialogueRules("researcher"),
    },
    { code: NpcCode.INNKEEPER, defaultDialogueCode: "innkeeper_default" },
    {
        code: NpcCode.FARMER_ROWAN,
        defaultDialogueCode: "rowan_default",
        dialogueRules: questDialogueRules("farmer_rowan"),
    },
    { code: NpcCode.GUARD_CAPTAIN, defaultDialogueCode: "guard_captain_default" },
    { code: NpcCode.HERBALIST, defaultDialogueCode: "herbalist_default" },

    // ---- Vật thể trong map (kind = object) ------------------------------------------------------------
    // Cổng không có chức năng ở đây: mỗi chỗ đặt khai báo `functions` ở slot của map (đích của cổng...); bệ teleport thì có sẵn.
    // Bảng thông báo: chỉ là thoại, không chức năng.
    {
        code: NpcCode.NOTICE_BOARD,
        kind: NpcKind.OBJECT,
        defaultDialogueCode: "notice_board",
    },
    // Cổng sang map khác (`portal`), cổng vào dungeon (`portal` — khác diện mạo), bệ dịch chuyển nhanh (`teleport`).
    { code: NpcCode.PORTAL_GATE, kind: NpcKind.OBJECT, autoOpen: true },
    { code: NpcCode.PORTAL_DUNGEON, kind: NpcKind.OBJECT, autoOpen: true },
    {
        code: NpcCode.TELEPORT_PAD,
        kind: NpcKind.OBJECT,
        autoOpen: true,
        functions: [{ id: "teleport", type: NpcFunctionType.TELEPORT, config: {} }],
    },
];
