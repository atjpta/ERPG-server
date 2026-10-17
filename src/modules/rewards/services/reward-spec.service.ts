import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";

/** Spec (item theo code) → `Reward` sẵn sàng cộng. Item không còn trong catalog bị bỏ qua. */
export const resolveRewardSpec = (spec: RewardSpec, source: ItemSource): Reward => ({
    exp: spec.exp,
    currency: spec.currency,
    items: spec.items.flatMap(({ itemCode, quantity }) => {
        const item = itemService.getByCode(itemCode);
        return item ? [{ itemId: item.id, quantity }] : [];
    }),
    source,
});
