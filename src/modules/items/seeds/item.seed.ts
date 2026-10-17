import { Items } from "@/modules/items/entities/item.entity.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { parseItemMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { ITEMS } from "@/modules/items/seeds/item.seed-data.js";

export const ItemSeed = async () => {
    for (const item of ITEMS) {
        parseItemMetadata(item.type, item.metadata); // seed sai cấu trúc thì dừng ngay
        await ItemRepo.upsert({
            data: item,
            target: Items.code,
            matchValue: item.code,
            updateData: item,
        });
    }
    // Trang bị cũ (stats cố định trong metadata) — schema mới không còn đọc được.
    const legacySword = await ItemRepo.findByCode({ code: "wooden_sword" });
    if (legacySword?.enabled) {
        await ItemRepo.updateById({ id: legacySword.id, data: { enabled: false } });
    }
    console.info("✅ [ItemSeed] Done");
};
