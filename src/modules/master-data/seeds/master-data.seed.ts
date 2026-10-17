import {
    DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG,
    DEFAULT_EQUIPMENT_DROP_CONFIG,
    DEFAULT_EQUIPMENT_ENHANCE_CONFIG,
    DEFAULT_EQUIPMENT_REFINE_CONFIG,
    DEFAULT_EQUIPMENT_SET_CONFIG,
    DEFAULT_EQUIPMENT_STAT_CONFIG,
} from "@/modules/equipment/seeds/equipment-config.seed-data.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { MasterDatas } from "@/modules/master-data/entities/master-data.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import type { MasterDataValueMap } from "@/modules/master-data/schemas/master-data-value.schema.js";
import { DEFAULT_PLAYER_TARGET_CONFIG } from "@/modules/master-data/schemas/player-target-config.schema.js";
import {
    isUnityMasterDataKey,
    loadUnityMasterData,
} from "@/modules/master-data/services/unity-master-data.service.js";
import { DEFAULT_MONSTER_AI_CONFIG } from "@/modules/monsters/schemas/monster-ai-config.schema.js";
import {
    DEFAULT_MONSTER_LEVEL_CONFIG,
    DEFAULT_MONSTER_SCALE_CONFIG,
    DEFAULT_MONSTER_SPAWN_CONFIG,
} from "@/modules/monsters/seeds/monster.seed-data.js";
import { DEFAULT_NPC_CONFIG } from "@/modules/npcs/schemas/npc-config.schema.js";
import { DEFAULT_DAILY_QUEST_CONFIG } from "@/modules/quests/seeds/daily-quest-config.seed-data.js";

const MAX_LEVEL = 100;
/** Tạm: exp lên level kế tiếp = 100 × level^1.5 (làm tròn). Chỉnh lại khi cân bằng game. */
const expToNextLevel = (level: number) => Math.round(100 * level ** 1.5);

const DEFAULTS: { [K in MasterDataKey]: { value: MasterDataValueMap[K]; note: string } } = {
    [MasterDataKey.AUTH_SESSION_CONFIG]: {
        value: { singleSessionPerUser: false },
        note: "Cấu hình session đăng nhập",
    },
    [MasterDataKey.PLAYER_CONFIG]: {
        value: {
            startMapCode: "greenfield_village",
            inventorySize: {
                [ItemType.EQUIPMENT]: 60,
                [ItemType.CONSUMABLE]: 40,
                [ItemType.MATERIAL]: 40,
            },
            inventoryNearlyFullThreshold: 5,
            maxCharacters: 4,
            nameMinLength: 3,
            nameMaxLength: 16,
        },
        note: "Cấu hình tạo player",
    },
    [MasterDataKey.LEVEL_CONFIG]: {
        value: {
            maxLevel: MAX_LEVEL,
            expToNextLevel: Array.from({ length: MAX_LEVEL - 1 }, (_, i) => expToNextLevel(i + 1)),
        },
        note: "Bảng exp lên level (expToNextLevel[i] = exp từ level i+1 lên i+2)",
    },
    [MasterDataKey.EQUIPMENT_STAT_CONFIG]: {
        value: DEFAULT_EQUIPMENT_STAT_CONFIG,
        note: "Main/sub/rarity stats trang bị theo class + loại trang bị + level",
    },
    [MasterDataKey.EQUIPMENT_SET_CONFIG]: {
        value: DEFAULT_EQUIPMENT_SET_CONFIG,
        note: "Set bonus theo biome + class + nhóm + level (2/4/6 món)",
    },
    [MasterDataKey.EQUIPMENT_ENHANCE_CONFIG]: {
        value: DEFAULT_EQUIPMENT_ENHANCE_CONFIG,
        note: "Cường hoá: tỉ lệ + chi phí từng bậc, giới hạn theo rarity",
    },
    [MasterDataKey.EQUIPMENT_REFINE_CONFIG]: {
        value: DEFAULT_EQUIPMENT_REFINE_CONFIG,
        note: "Tinh hoá: tỉ lệ + chi phí theo rarity đích",
    },
    [MasterDataKey.EQUIPMENT_DISASSEMBLE_CONFIG]: {
        value: DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG,
        note: "Phân rã: công thức tinh linh (theo rarity) + bụi (theo cường hoá)",
    },
    [MasterDataKey.EQUIPMENT_DROP_CONFIG]: {
        value: DEFAULT_EQUIPMENT_DROP_CONFIG,
        note: "Mốc level đồ rơi + độ lệch level quái",
    },
    [MasterDataKey.MONSTER_SCALE_CONFIG]: {
        value: DEFAULT_MONSTER_SCALE_CONFIG,
        note: "Hệ số chỉ số + thưởng của monster theo loại và độ hiếm (nhân với nhau)",
    },
    [MasterDataKey.MONSTER_LEVEL_CONFIG]: {
        value: DEFAULT_MONSTER_LEVEL_CONFIG,
        note: "Tỉ lệ tăng mỗi level theo từng chỉ số của monster (dùng chung mọi monster)",
    },
    [MasterDataKey.MONSTER_SPAWN_CONFIG]: {
        value: DEFAULT_MONSTER_SPAWN_CONFIG,
        note: "Roll loại (normal/elite) + độ hiếm của monster khi sinh / hồi sinh; giới hạn elite mỗi map",
    },
    [MasterDataKey.PARTY_CONFIG]: {
        value: {
            maxMembers: 4,
            inviteTtlSec: 30,
            expBonusPerExtraMember: 0.1,
            maxLevelGap: 10,
            shareGold: true,
            lootMode: PartyLootMode.ROUND_ROBIN,
        },
        note: "Party: số thành viên tối đa, hạn lời mời, bonus exp, giới hạn chênh level, chia vàng, cách chia item",
    },
    [MasterDataKey.PLAYER_TARGET_CONFIG]: {
        value: DEFAULT_PLAYER_TARGET_CONFIG,
        note: "Tầm chọn / giữ / quay mặt về target theo class + thông số auto battle (client đọc qua skills.json)",
    },
    [MasterDataKey.MONSTER_AI_CONFIG]: {
        value: DEFAULT_MONSTER_AI_CONFIG,
        note: "Tốc độ, tầm thấy / đuổi / đi dạo của monster, mặc định + ghi đè theo monster (làm trong Unity)",
    },
    [MasterDataKey.NPC_CONFIG]: {
        value: DEFAULT_NPC_CONFIG,
        note: "Tầm nói chuyện của NPC, mặc định + ghi đè theo NPC (làm trong Unity)",
    },
    [MasterDataKey.DAILY_QUEST_CONFIG]: {
        value: DEFAULT_DAILY_QUEST_CONFIG,
        note: "Quest hằng ngày: giờ reset, bậc level, thưởng theo level",
    },
};

export const MasterDataSeed = async () => {
    for (const key of Object.values(MasterDataKey)) {
        // Ranges are authored in Unity: the file wins over the default and the table is overwritten by it on every seed.
        const { value, note } = isUnityMasterDataKey(key)
            ? {
                  value: loadUnityMasterData(key),
                  note: `${DEFAULTS[key].note}. Làm trong Unity, không sửa ở admin.`,
              }
            : DEFAULTS[key];
        await MasterDataRepo.upsert({
            data: { key, value, note },
            target: MasterDatas.key,
            matchValue: key,
            updateData: { value, note },
        });
    }
    console.info("✅ [MasterDataSeed] Done");
};
