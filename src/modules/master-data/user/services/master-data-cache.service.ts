import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import {
    MasterDataValueSchemas,
    type MasterDataValueMap,
} from "@/modules/master-data/schemas/master-data-value.schema.js";

/**
 * Cache mọi master data lúc khởi động (parse lại bằng schema — sai cấu trúc thì báo ngay) để logic
 * trong room đọc đồng bộ, không query DB. Admin sửa key nào thì `reload(key)` key đó.
 */
export class MasterDataCacheService {
    private readonly values = new Map<MasterDataKey, unknown>();

    public async setCacheData() {
        const rows = await MasterDataRepo.findMany();
        this.values.clear();
        for (const row of rows) this.values.set(row.key, this.parse(row.key, row.value));
        const missing = Object.values(MasterDataKey).filter((key) => !this.values.has(key));
        if (missing.length > 0) {
            console.warn(`[MasterData] Missing keys: ${missing.join(", ")} — run yarn seed`);
        }
        console.log(`Cached ${rows.length} master data`);
    }

    public async reload(key: MasterDataKey) {
        const row = await MasterDataRepo.findByKey({ key });
        if (row) this.values.set(key, this.parse(key, row.value));
        else this.values.delete(key);
    }

    /** Value đã cache — throw nếu chưa seed (lỗi cấu hình server, không phải lỗi người chơi). */
    get<K extends MasterDataKey>(key: K): MasterDataValueMap[K] {
        if (!this.values.has(key)) throw new Error(`Master data "${key}" is not cached`);
        return this.values.get(key) as MasterDataValueMap[K];
    }

    private parse(key: MasterDataKey, value: unknown) {
        try {
            return MasterDataValueSchemas[key].parse(value);
        } catch (error) {
            throw new Error(`Master data "${key}" is invalid: ${String(error)}`, { cause: error });
        }
    }
}

export const masterDataCacheService = new MasterDataCacheService();
