import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type {
    EquipmentSetEntry,
    EquipmentStatEntry,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import type {
    EquipmentGroup,
    ItemEquipmentType,
} from "@/modules/items/enums/item-equipment.enum.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";

/** Đọc config trang bị (master data đã cache) + tra bảng stat/set theo key. */
export class EquipmentConfigService {
    private readonly statIndexes = new WeakMap<
        EquipmentStatEntry[],
        Map<string, EquipmentStatEntry>
    >();
    private readonly setIndexes = new WeakMap<
        EquipmentSetEntry[],
        Map<string, EquipmentSetEntry>
    >();

    /** Bảng chỉ số của 1 loại trang bị (class `null` = đồ dùng chung) ở 1 level. */
    findStatEntry(
        classCode: string | null,
        equipmentType: ItemEquipmentType,
        level: number
    ): EquipmentStatEntry | undefined {
        const index = this.indexed(
            masterDataCacheService.get(MasterDataKey.EQUIPMENT_STAT_CONFIG).entries,
            this.statIndexes,
            (entry) => this.statKey(entry.classCode, entry.equipmentType, entry.level)
        );
        return index.get(this.statKey(classCode, equipmentType, level));
    }

    findSetEntry(
        biome: Biome,
        classCode: string,
        group: EquipmentGroup,
        level: number
    ): EquipmentSetEntry | undefined {
        const index = this.indexed(
            masterDataCacheService.get(MasterDataKey.EQUIPMENT_SET_CONFIG).entries,
            this.setIndexes,
            (entry) => this.setKey(entry.biome, entry.classCode, entry.group, entry.level)
        );
        return index.get(this.setKey(biome, classCode, group, level));
    }

    private statKey(classCode: string | null, type: ItemEquipmentType, level: number) {
        return `${classCode ?? "*"}:${type}:${level}`;
    }

    private setKey(biome: Biome, classCode: string, group: EquipmentGroup, level: number) {
        return `${biome}:${classCode}:${group}:${level}`;
    }

    /** Index theo key, dựng lại khi master data đổi (admin sửa → object config mới). */
    private indexed<T>(
        entries: T[],
        cache: WeakMap<T[], Map<string, T>>,
        toKey: (entry: T) => string
    ) {
        let index = cache.get(entries);
        if (!index) {
            index = new Map(entries.map((entry) => [toKey(entry), entry]));
            cache.set(entries, index);
        }
        return index;
    }
}

export const equipmentConfigService = new EquipmentConfigService();
