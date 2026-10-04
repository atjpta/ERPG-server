import { MasterDatas } from "@/modules/master-data/entities/master-data.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import type { MasterDataValueMap } from "@/modules/master-data/schemas/master-data-value.schema.js";

const MAX_LEVEL = 100;
/** Tạm: exp lên level kế tiếp = 100 × level^1.5 (làm tròn). Chỉnh lại khi cân bằng game. */
const expToNextLevel = (level: number) => Math.round(100 * level ** 1.5);

const DEFAULTS: { [K in MasterDataKey]: { value: MasterDataValueMap[K]; note: string } } = {
    [MasterDataKey.AUTH_SESSION_CONFIG]: {
        value: { singleSessionPerUser: false },
        note: "Cấu hình session đăng nhập",
    },
    [MasterDataKey.PLAYER_CONFIG]: {
        value: { startMapCode: "town_01" },
        note: "Cấu hình tạo player",
    },
    [MasterDataKey.LEVEL_CONFIG]: {
        value: {
            maxLevel: MAX_LEVEL,
            expToNextLevel: Array.from({ length: MAX_LEVEL - 1 }, (_, i) => expToNextLevel(i + 1)),
        },
        note: "Bảng exp lên level (expToNextLevel[i] = exp từ level i+1 lên i+2)",
    },
};

export const MasterDataSeed = async () => {
    for (const key of Object.values(MasterDataKey)) {
        const { value, note } = DEFAULTS[key];
        await MasterDataRepo.upsert({
            data: { key, value, note },
            target: MasterDatas.key,
            matchValue: key,
            updateData: { value, note },
        });
    }
    console.info("✅ [MasterDataSeed] Done");
};
