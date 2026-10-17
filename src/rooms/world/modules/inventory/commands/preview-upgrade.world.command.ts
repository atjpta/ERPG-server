import type { PlayerClient } from "@/core/rooms/base-player.room.js";
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
            const { action, instanceId } = (payload ?? {}) as Record<string, unknown>;
            this.sendUpgradePreview(
                client,
                player,
                action === EquipmentUpgradeAction.REFINE
                    ? EquipmentUpgradeAction.REFINE
                    : EquipmentUpgradeAction.ENHANCE,
                typeof instanceId === "string" ? instanceId : "",
                "Invalid payload"
            );
            return;
        }
        this.sendUpgradePreview(client, player, parsed.data.action, parsed.data.instanceId);
    }

    /** Gửi `upgradePreview`: chi phí, tỉ lệ cường hoá / tinh hoá món này và player có đủ không. */
    private sendUpgradePreview(
        client: PlayerClient,
        player: PlayerWorldState,
        action: EquipmentUpgradeAction.ENHANCE | EquipmentUpgradeAction.REFINE,
        instanceId: string,
        error?: string
    ) {
        const empty = {
            rate: 0,
            gold: 0,
            materials: [] as MaterialRequirementMessage[],
            affordable: false,
        };
        const ownedGold = player.wallet[CurrencyCode.GOLD]?.balance ?? 0;
        const reply = (
            preview: Omit<UpgradePreviewMessage, "action" | "instanceId" | "ownedGold">
        ) => {
            const message: UpgradePreviewMessage = { action, instanceId, ownedGold, ...preview };
            client.send(WorldMessage.UPGRADE_PREVIEW, message);
        };
        if (error) return reply({ ok: false, error, ...empty });

        const owned = equipmentUpgradeWorldService.findOwned(player, instanceId);
        if (!owned) return reply({ ok: false, error: "Equipment not found", ...empty });

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
                ok: true,
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
            if ("reason" in cost) return reply({ ok: false, error: cost.reason, ...empty });
            return reply({
                ...priced(cost.value),
                enhanceLevel: owned.metadata.enhanceLevel + 1,
                downgradeOnFail: cost.value.step.downgradeOnFail,
            });
        }
        const cost = refineCost(owned.metadata, equipmentConfigService.refine);
        if ("reason" in cost) return reply({ ok: false, error: cost.reason, ...empty });
        return reply({ ...priced(cost.value), rarity: cost.value.target });
    }
}
