import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import { MasterDataValueSchemas } from "@/modules/master-data/schemas/master-data-value.schema.js";
import type { AdminUpdateMasterDataBody } from "@/modules/master-data/admin/validators/admin.master-data.validator.js";

export class AdminMasterDataService {
    async getAll() {
        return MasterDataRepo.findMany();
    }

    async getByKey(key: MasterDataKey) {
        return MasterDataRepo.findByKey({ key });
    }

    async update(key: MasterDataKey, body: AdminUpdateMasterDataBody) {
        const row = await MasterDataRepo.findByKey({ key });
        if (!row) {
            serviceError(`Master data "${key}" not found`, 404, ResponseCode.MASTER_DATA_NOT_FOUND);
        }
        // Sai cấu trúc → ZodError → RouterContainer trả 422.
        const value = MasterDataValueSchemas[key].parse(body.value);
        return MasterDataRepo.updateById({
            id: row.id,
            data: { value, ...(body.note !== undefined ? { note: body.note } : {}) },
        });
    }
}

export const adminMasterDataService = new AdminMasterDataService();
