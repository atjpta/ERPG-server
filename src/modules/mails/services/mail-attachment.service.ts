import { Response } from "@/core/response/response.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { Inventories, InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { AttachmentSpec } from "@/modules/mails/types/mail-attachment.type.js";

/** Rút các món người gửi chọn khỏi túi để đính kèm vào thư. Chỉ làm việc trên bản `inventories` truyền vào. */
export class MailAttachmentService {
    /**
     * Kiểm tra rồi rút `specs` khỏi `inventories` (sửa trực tiếp, nên truyền bản làm việc). Món phải nằm trong túi,
     * không khoá, đủ số lượng; một ô chỉ được chọn một lần. Lỗi thì không rút gì.
     */
    take(inventories: Inventories, specs: readonly AttachmentSpec[]): Response<ItemReward[]> {
        const picked: { bag: InventoryItem[]; entry: InventoryItem; quantity: number }[] = [];
        const seen = new Set<string>();
        for (const { instanceId, quantity } of specs) {
            if (seen.has(instanceId)) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
            seen.add(instanceId);
            const found = this.find(inventories, instanceId);
            if (!found) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
            if (found.entry.isLocked) return Response.error(ItemErrorCode.ITEM_LOCKED);
            if (quantity < 1 || quantity > found.entry.quantity) {
                return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH);
            }
            picked.push({ ...found, quantity });
        }

        const items: ItemReward[] = [];
        for (const { bag, entry, quantity } of picked) {
            const item = itemService.getById(entry.itemId);
            items.push({
                itemId: entry.itemId,
                quantity,
                // Chỉ trang bị mang chỉ số riêng; item xếp chồng thì chỉ cần id + số lượng.
                ...(item?.type === ItemType.EQUIPMENT
                    ? { metadata: structuredClone(entry.metadata) as ItemEquipmentInstanceMetadata }
                    : {}),
            });
            if (quantity === entry.quantity) bag.splice(bag.indexOf(entry), 1);
            else entry.quantity -= quantity;
        }
        return Response.success(items);
    }

    private find(inventories: Inventories, instanceId: string) {
        for (const bag of Object.values(inventories)) {
            const entry = bag.find((candidate) => candidate.id === instanceId);
            if (entry) return { bag, entry };
        }
        return undefined;
    }
}

export const mailAttachmentService = new MailAttachmentService();
