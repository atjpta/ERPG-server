import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import {
    LevelConfigSchema,
    type LevelConfigValue,
} from "@/modules/master-data/schemas/master-data-value.schema.js";
import { masterDataService } from "@/modules/master-data/services/master-data.service.js";

/** Cache bảng exp (master data `level_config`) lúc khởi động và khi admin sửa. */
export class LevelService {
    private config: LevelConfigValue = {
        maxLevel: 1,
        expToNextLevel: [],
        attributePointsPerLevel: 0,
        skillPointsPerLevel: 0,
    };

    public async setCacheData() {
        const config = await masterDataService.findValue(MasterDataKey.LEVEL_CONFIG);
        if (!config) {
            console.warn(
                `[Level] Master data "${MasterDataKey.LEVEL_CONFIG}" missing — run yarn seed`
            );
            return;
        }
        // Parse lại để row cũ thiếu field mới vẫn nhận giá trị mặc định của schema.
        this.config = LevelConfigSchema.parse(config);
        console.log(`Cached level config (max level ${config.maxLevel})`);
    }

    get maxLevel(): number {
        return this.config.maxLevel;
    }

    get attributePointsPerLevel(): number {
        return this.config.attributePointsPerLevel;
    }

    get skillPointsPerLevel(): number {
        return this.config.skillPointsPerLevel;
    }

    /** Exp cần tích luỹ ở `level` để lên `level + 1`; `undefined` = level tối đa (không lên nữa). */
    getExpToNext(level: number): number | undefined {
        if (level < 1 || level >= this.config.maxLevel) return undefined;
        return this.config.expToNextLevel[level - 1];
    }
}

export const levelService = new LevelService();
