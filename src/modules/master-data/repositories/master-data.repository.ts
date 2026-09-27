import { eq } from "drizzle-orm";
import type { Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { MasterDatas } from "@/modules/master-data/entities/master-data.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";

export class MasterDataRepository extends BaseRepository<typeof MasterDatas> {
    constructor() {
        super(MasterDatas);
    }

    async findByKey(params: { key: MasterDataKey; dbOrTx?: Queryable }) {
        const { key, dbOrTx } = params;
        return this.findOne({ where: eq(MasterDatas.key, key), dbOrTx });
    }
}

export const MasterDataRepo = new MasterDataRepository();
