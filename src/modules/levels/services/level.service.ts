import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import type { LevelConfigValue } from "@/modules/master-data/schemas/master-data-value.schema.js";
import { masterDataService } from "@/modules/master-data/user/services/master-data.service.js";

/** Cache bảng exp (master data `level_config`) lúc khởi động và khi admin sửa. */
export class LevelService {
    private config: LevelConfigValue = { maxLevel: 1, expToNextLevel: [] };

    public async setCacheData() {
        const config = await masterDataService.findValue(MasterDataKey.LEVEL_CONFIG);
        if (!config) {
            console.warn(
                `[Level] Master data "${MasterDataKey.LEVEL_CONFIG}" missing — run yarn seed`
            );
            return;
        }
        this.config = config;
        console.log(`Cached level config (max level ${config.maxLevel})`);
    }

    get maxLevel(): number {
        return this.config.maxLevel;
    }

    /** Exp cần tích luỹ ở `level` để lên `level + 1`; `undefined` = level tối đa (không lên nữa). */
    getExpToNext(level: number): number | undefined {
        if (level < 1 || level >= this.config.maxLevel) return undefined;
        return this.config.expToNextLevel[level - 1];
    }
}

export const levelService = new LevelService();
