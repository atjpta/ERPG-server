import type { ErrorCode } from "@/core/types/result.type.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { isFail } from "@/core/utils/result.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { sendFail, sendOk } from "@/core/utils/room-send.util.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import {
    enhanceCost,
    refineCost,
    type UpgradeCost,
} from "@/modules/equipment/services/equipment-upgrade.service.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { countItem } from "@/modules/player/services/inventory.service.js";
import { equipmentUpgradeWorldService } from "@/rooms/world/modules/inventory/services/equipment-upgrade.world.service.js";
import { PreviewUpgradeSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    EquipmentUpgradeAction,
    WorldClientMessage,
    WorldMessage,
    type MaterialRequirementMessage,
    type UpgradePreviewMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Chi phí / tỉ lệ cường hoá hoặc tinh hoá (cho client hiện modal nâng cấp) — không đổi state. */
export class PreviewUpgradeWorldCommand extends Command<WorldRoom, InventoryCommandPayload> {
    static readonly message = WorldClientMessage.PREVIEW_UPGRADE;

    execute({ client, payload }: InventoryCommandPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = PreviewUpgradeSchema.safeParse(payload);
        if (!parsed.success) {
            sendFail(client, WorldMessage.UPGRADE_PREVIEW, CommonCode.INVALID_INPUT);
            return;
        }
        this.sendUpgradePreview(client, player, parsed.data.action, parsed.data.instanceId);
    }

    /** Gửi `upgradePreview`: chi phí, tỉ lệ cường hoá / tinh hoá món này và player có đủ không. */
    private sendUpgradePreview(
        client: PlayerClient,
        player: PlayerWorldState,
        action: EquipmentUpgradeAction.ENHANCE | EquipmentUpgradeAction.REFINE,
        instanceId: string
    ) {
        const ownedGold = player.wallet[CurrencyCode.GOLD]?.balance ?? 0;
        const reply = (
            preview: Omit<UpgradePreviewMessage, "action" | "instanceId" | "ownedGold">
        ) => {
            const message: UpgradePreviewMessage = { action, instanceId, ownedGold, ...preview };
            sendOk(client, WorldMessage.UPGRADE_PREVIEW, message);
        };
        const refuse = (code: ErrorCode) =>
            sendFail(client, WorldMessage.UPGRADE_PREVIEW, code, { action, instanceId });

        const owned = equipmentUpgradeWorldService.findOwned(player, instanceId);
        if (!owned) return refuse(ItemErrorCode.EQUIPMENT_NOT_FOUND);

        const bag = player.inventories[ItemType.MATERIAL];
        const requirements = (cost: UpgradeCost): MaterialRequirementMessage[] =>
            cost.materials.map(({ code, quantity }) => {
                const item = itemService.getByCode(code);
                return {
                    itemId: item?.id ?? "",
                    code,
                    quantity,
                    owned: item ? countItem(bag, item.id) : 0,
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

        if (action === EquipmentUpgradeAction.ENHANCE) {
            const cost = enhanceCost(owned.metadata, owned.group, equipmentConfigService.enhance);
            if (isFail(cost)) return refuse(cost.code);
            return reply({
                ...priced(cost.data),
                enhanceLevel: owned.metadata.enhanceLevel + 1,
                downgradeOnFail: cost.data.step.downgradeOnFail,
            });
        }
        const cost = refineCost(owned.metadata, equipmentConfigService.refine);
        if (isFail(cost)) return refuse(cost.code);
        return reply({ ...priced(cost.data), rarity: cost.data.target });
    }
}
