import { cacheService } from "@/core/cache/cache.service.js";
import type { Item } from "@/modules/items/entities/item.entity.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { parseItemMetadata } from "@/modules/items/schemas/item-metadata.schema.js";

/** Cache catalog item lúc khởi động (giống SkillService); chưa có nghiệp vụ. */
export class ItemService {
    private readonly itemsById = new Map<string, Item>();
    private readonly itemsByCode = new Map<string, Item>();

    public async setCacheData() {
        const items = await ItemRepo.findEnabled();
        this.itemsById.clear();
        this.itemsByCode.clear();
        for (const item of items) {
            // Metadata sai cấu trúc thì báo ngay lúc khởi động, không để lỗi khi đang chơi.
            const cached = { ...item, metadata: parseItemMetadata(item.type, item.metadata) };
            this.itemsById.set(item.id, cached);
            this.itemsByCode.set(item.code, cached);
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
}

export const itemService = new ItemService();
