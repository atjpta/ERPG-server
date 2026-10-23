import { levelService } from "@/modules/levels/services/level.service.js";
import { Response } from "@/core/response/response.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataErrorCode } from "@/modules/master-data/enums/master-data-error-code.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import { MasterDataValueSchemas } from "@/modules/master-data/schemas/master-data-value.schema.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { unityMasterDataService } from "@/modules/master-data/services/unity-master-data.service.js";
import type { MasterData } from "@/modules/master-data/entities/master-data.entity.js";

export class MasterDataUpdateService {
    /** Admin sửa một cấu hình: validate theo schema của key, ghi DB rồi nạp lại cache của process. */
    async update(params: {
        key: MasterDataKey;
        value: unknown;
        note?: string;
    }): Promise<Response<MasterData>> {
        const { key, value, note } = params;
        if (unityMasterDataService.isUnityMasterDataKey(key)) {
            // Authored in Unity (Ranges tab of the Authoring Hub) and synced from there.
            return Response.error(MasterDataErrorCode.MASTER_DATA_READ_ONLY);
        }
        const row = await MasterDataRepo.findByKey({ key });
        if (!row) return Response.error(MasterDataErrorCode.MASTER_DATA_NOT_FOUND);
        // Sai cấu trúc → ZodError → RouterContainer trả 422.
        const parsed = MasterDataValueSchemas[key].parse(value);
        const updated = await MasterDataRepo.updateById({
            id: row.id,
            data: { value: parsed, ...(note !== undefined ? { note } : {}) },
        });
        // Master data được cache trong process — nạp lại ngay để room dùng giá trị mới.
        await masterDataCacheService.reload(key);
        if (key === MasterDataKey.LEVEL_CONFIG) await levelService.setCacheData();
        return Response.success(updated);
    }
}

export const masterDataUpdateService = new MasterDataUpdateService();
