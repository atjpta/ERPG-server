import { MasterDatas } from "@/modules/master-data/entities/master-data.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import type { MasterDataValueMap } from "@/modules/master-data/schemas/master-data-value.schema.js";

const DEFAULTS: { [K in MasterDataKey]: { value: MasterDataValueMap[K]; note: string } } = {
    [MasterDataKey.AUTH_SESSION_CONFIG]: {
        value: { singleSessionPerUser: false },
        note: "Cấu hình session đăng nhập",
    },
    [MasterDataKey.PLAYER_CONFIG]: {
        value: { startMapCode: "town_01" },
        note: "Cấu hình tạo player",
    },
};

export const MasterDataSeed = async (force = false) => {
    for (const key of Object.values(MasterDataKey)) {
        const { value, note } = DEFAULTS[key];
        await MasterDataRepo.upsert({
            data: { key, value, note },
            target: MasterDatas.key,
            matchValue: key,
            updateData: force ? { value, note } : undefined,
        });
    }
    console.info("✅ [MasterDataSeed] Done");
};
