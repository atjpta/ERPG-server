import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { Response } from "@/core/utils/response.util.js";
import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import { equipmentStatService } from "@/modules/equipment/services/equipment-stat.service.js";
import {
    type UpgradeCost,
    equipmentUpgradeService,
} from "@/modules/equipment/services/equipment-upgrade.service.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { PreviewUpgradeSchema } from "@/rooms/global/modules/inventory/validators/inventory.global.validator.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
import type {
    MaterialRequirementMessage,
    UpgradePreviewMessage,
} from "@/rooms/global/modules/equipment-upgrade/interfaces/equipment-upgrade.global.message.js";
import type { StatLineMessage } from "@/rooms/global/modules/player-data/interfaces/player-data.global.message.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Chi phí / tỉ lệ cường hoá hoặc tinh hoá (cho client hiện modal nâng cấp) — không đổi state. */
@SdkMessage({
    response: "UpgradePreviewMessage",
    errors: [
        CommonCode.INVALID_INPUT,
        ItemErrorCode.EQUIPMENT_NOT_FOUND,
        ItemErrorCode.EQUIPMENT_CONFIG_MISSING,
        ItemErrorCode.EQUIPMENT_MAX_ENHANCE,
        ItemErrorCode.EQUIPMENT_NEEDS_REFINE,
        ItemErrorCode.EQUIPMENT_MAX_RARITY,
        ItemErrorCode.ITEM_NOT_ENOUGH,
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
    ],
    note: "Lỗi có `error: { action, instanceId }`.",
})
export class PreviewUpgradeGlobalCommand extends PlayerGlobalCommand<
    InventoryCommandPayload,
    typeof PreviewUpgradeSchema
> {
    static readonly message = GlobalClientMessage.PREVIEW_UPGRADE;

    protected override readonly validateSchema = PreviewUpgradeSchema;

    async execute({ client }: InventoryCommandPayload) {
        this.result = await playerDataGlobalService.read(
            this.room,
            client.auth.playerId,
            { pullsWorld: true },
            (state, world) =>
                this.upgradePreview(state, world, this.body.action, this.body.instanceId)
        );
    }

    /** Chi phí, tỉ lệ cường hoá / tinh hoá món này và player có đủ không. */
    private upgradePreview(
        player: PlayerDataState,
        world: PlayerWorldView | undefined,
        action: EquipmentUpgradeAction.ENHANCE | EquipmentUpgradeAction.REFINE,
        instanceId: string
    ) {
        const ownedGold = world?.wallet[CurrencyCode.GOLD]?.balance ?? 0;
        const reply = (
            preview: Omit<UpgradePreviewMessage, "action" | "instanceId" | "ownedGold">
        ) => {
            return Response.success<UpgradePreviewMessage>({
                action,
                instanceId,
                ownedGold,
                ...preview,
            });
        };
        const refuse = (code: ErrorCode) => Response.error(code, undefined, { action, instanceId });

        const owned = player.findOwned(instanceId);
        if (!owned) return refuse(ItemErrorCode.EQUIPMENT_NOT_FOUND);

        const bag = player.inventories[ItemType.MATERIAL];
        const requirements = (cost: UpgradeCost): MaterialRequirementMessage[] =>
            cost.materials.map(({ code, quantity }) => {
                const item = itemService.getByCode(code);
                return {
                    itemId: item?.id ?? "",
                    code,
                    quantity,
                    owned: item ? inventoryService.countItem(bag, item.id) : 0,
                };
            });
        const priced = (cost: UpgradeCost) => {
            const materials = requirements(cost);
            return {
                rate: cost.rate,
                gold: cost.gold,
                materials,
                affordable:
                    ownedGold >= cost.gold &&
                    materials.every((material) => material.owned >= material.quantity),
            };
        };

        /** Main stats sau khi nâng cấp thành công: mainStats gốc × hệ số của cấp cường hoá / tinh hoá mới. */
        const finalMainStatsAt = (levels: {
            enhanceLevel: number;
            refineLevel: number;
        }): StatLineMessage[] => {
            const multiplier = equipmentStatService.mainStatMultiplier(levels, {
                enhance: masterDataCacheService.get(MasterDataKey.EQUIPMENT_ENHANCE_CONFIG)
                    .mainStatGrowth,
                refine: masterDataCacheService.get(MasterDataKey.EQUIPMENT_REFINE_CONFIG)
                    .mainStatGrowth,
            });
            return owned.metadata.mainStats.map((line) => ({
                ...line,
                value: bigToNumber(big(line.value).times(multiplier)),
            }));
        };

        if (action === EquipmentUpgradeAction.ENHANCE) {
            const cost = equipmentUpgradeService.enhanceCost(
                owned.metadata,
                owned.group,
                masterDataCacheService.get(MasterDataKey.EQUIPMENT_ENHANCE_CONFIG)
            );
            if (Response.isError(cost)) return refuse(cost.code);
            return reply({
                ...priced(cost.data),
                enhanceLevel: owned.metadata.enhanceLevel + 1,
                downgradeOnFail: cost.data.step.downgradeOnFail,
                finalMainStats: finalMainStatsAt({
                    enhanceLevel: owned.metadata.enhanceLevel + 1,
                    refineLevel: owned.metadata.refineLevel,
                }),
            });
        }
        const cost = equipmentUpgradeService.refineCost(
            owned.metadata,
            masterDataCacheService.get(MasterDataKey.EQUIPMENT_REFINE_CONFIG)
        );
        if (Response.isError(cost)) return refuse(cost.code);
        return reply({
            ...priced(cost.data),
            rarity: cost.data.target,
            finalMainStats: finalMainStatsAt({
                enhanceLevel: owned.metadata.enhanceLevel,
                refineLevel: owned.metadata.refineLevel + 1,
            }),
        });
    }
}
