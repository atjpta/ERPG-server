import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import type { MasterDataValueMap } from "@/modules/master-data/schemas/master-data-value.schema.js";

export class MasterDataService {
    /** Lấy value (typed theo key) — throw 404 nếu chưa seed. */
    async getValue<K extends MasterDataKey>(
        key: K,
        dbOrTx?: Queryable
    ): Promise<MasterDataValueMap[K]> {
        const row = await MasterDataRepo.findByKey({ key, dbOrTx });
        if (!row) {
            serviceError(
                `Master data "${key}" chưa được seed`,
                404,
                ResponseCode.MASTER_DATA_NOT_FOUND
            );
        }
        return row.value as MasterDataValueMap[K];
    }

    /** Như `getValue` nhưng trả `null` thay vì throw — dùng cho config tuỳ chọn. */
    async findValue<K extends MasterDataKey>(
        key: K,
        dbOrTx?: Queryable
    ): Promise<MasterDataValueMap[K] | null> {
        const row = await MasterDataRepo.findByKey({ key, dbOrTx });
        return (row?.value as MasterDataValueMap[K]) ?? null;
    }
}

export const masterDataService = new MasterDataService();
