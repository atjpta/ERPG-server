import { MasterDataErrorCode } from "@/modules/master-data/enums/master-data-error-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { unityMasterDataService } from "@/modules/master-data/services/unity-master-data.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import { MasterDataValueSchemas } from "@/modules/master-data/schemas/master-data-value.schema.js";
import type { AdminUpdateMasterDataBody } from "@/apis/admin/master-data/validators/admin.master-data.validator.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";

export class AdminMasterDataService {
    async getAll() {
        return MasterDataRepo.findMany();
    }

    async getByKey(key: MasterDataKey) {
        return MasterDataRepo.findByKey({ key });
    }

    async update(key: MasterDataKey, body: AdminUpdateMasterDataBody) {
        if (unityMasterDataService.isUnityMasterDataKey(key)) {
            serviceError(
                `Master data "${key}" is authored in Unity (Ranges tab of the Authoring Hub) and synced from there`,
                409,
                MasterDataErrorCode.MASTER_DATA_READ_ONLY
            );
        }
        const row = await MasterDataRepo.findByKey({ key });
        if (!row) {
            serviceError(
                `Master data "${key}" not found`,
                404,
                MasterDataErrorCode.MASTER_DATA_NOT_FOUND
            );
        }
        // Sai cấu trúc → ZodError → RouterContainer trả 422.
        const value = MasterDataValueSchemas[key].parse(body.value);
        const updated = await MasterDataRepo.updateById({
            id: row.id,
            data: { value, ...(body.note !== undefined ? { note: body.note } : {}) },
        });
        // Master data được cache trong process — nạp lại ngay để room dùng giá trị mới.
        await masterDataCacheService.reload(key);
        if (key === MasterDataKey.LEVEL_CONFIG) await levelService.setCacheData();
        return updated;
    }
}

export const adminMasterDataService = new AdminMasterDataService();
