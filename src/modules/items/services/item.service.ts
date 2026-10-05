import { cacheService } from "@/core/cache/cache.service.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { EquipmentMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { Item } from "@/modules/items/entities/item.entity.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { parseItemMetadata } from "@/modules/items/schemas/item-metadata.schema.js";

/** Cache catalog item lúc khởi động (giống SkillService). */
export class ItemService {
    private readonly itemsById = new Map<string, Item>();
    private readonly itemsByCode = new Map<string, Item>();
    private readonly equipmentsByBiome = new Map<Biome, Item[]>();

    public async setCacheData() {
        const items = await ItemRepo.findEnabled();
        this.itemsById.clear();
        this.itemsByCode.clear();
        this.equipmentsByBiome.clear();
        for (const item of items) {
            // Metadata sai cấu trúc thì báo ngay lúc khởi động, không để lỗi khi đang chơi.
            const cached = { ...item, metadata: parseItemMetadata(item.type, item.metadata) };
            this.itemsById.set(item.id, cached);
            this.itemsByCode.set(item.code, cached);
            if (cached.type === ItemType.EQUIPMENT) {
                const { biome } = cached.metadata as EquipmentMetadata;
                this.equipmentsByBiome.set(biome, [
                    ...(this.equipmentsByBiome.get(biome) ?? []),
                    cached,
                ]);
            }
        }
        await cacheService.set("items", this.itemsByCode);
        console.log(`Cached ${items.length} items`);
    }

    getById(id: string): Item | undefined {
        return this.itemsById.get(id);
    }

    getByCode(code: string): Item | undefined {
        return this.itemsByCode.get(code);
    }

    /** Template trang bị của 1 biome (mọi class, mọi loại). */
    listEquipmentsByBiome(biome: Biome): readonly Item[] {
        return this.equipmentsByBiome.get(biome) ?? [];
    }
}

export const itemService = new ItemService();
