import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";

export class RewardSpecService {
    /** Spec (item theo code) → `Reward` sẵn sàng cộng. Item không còn trong catalog bị bỏ qua. */
    resolveRewardSpec(spec: RewardSpec, source: ItemSource): Reward {
        return {
            exp: spec.exp,
            currency: spec.currency,
            items: spec.items.flatMap(({ itemCode, quantity }) => {
                const item = itemService.getByCode(itemCode);
                return item ? [{ itemId: item.id, quantity }] : [];
            }),
            source,
        };
    }
}

export const rewardSpecService = new RewardSpecService();
