import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { evaluateConditions } from "@/modules/dialogues/services/condition.service.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MapInteractable } from "@/modules/maps/entities/game-map.entity.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { teleportStatus, type TeleportStatus } from "@/modules/maps/services/teleport.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { resolveRewardSpec } from "@/modules/rewards/services/reward-spec.service.js";
import { InteractableWorldState } from "@/rooms/world/modules/content/schemas/interactable.world.state.js";
import { contentWorldService } from "@/rooms/world/modules/content/services/content.world.service.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { InteractSchema } from "@/rooms/world/modules/content/validators/content.world.validator.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import {
    WorldClientMessage,
    WorldMessage,
    type InteractResultMessage,
    type TeleportListMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

const pickStatus = ({ discovered, available }: TeleportStatus) => ({ discovered, available });

interface ContentPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tương tác vật thể trong map (portal, thu thập, biển báo). */
export class InteractWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.INTERACT;

    async execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = InteractSchema.safeParse(payload);
        if (!parsed.success) {
            const message: InteractResultMessage = { ok: false, error: "Invalid payload", id: "" };
            client.send(WorldMessage.INTERACT_RESULT, message);
            return;
        }
        await this.interact(this.room, client, player, parsed.data.id);
    }

    private async interact(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        id: string
    ): Promise<void> {
        const error = await this.run(room, client, player, id);
        const message: InteractResultMessage = { ok: !error, id, ...(error ? { error } : {}) };
        client.send(WorldMessage.INTERACT_RESULT, message);
    }

    private async run(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        id: string
    ): Promise<string | undefined> {
        if (player.hp <= 0) return "Player is dead";
        const def = room.map.interactables.find((it) => it.id === id);
        const state = room.state.interactables.find((it) => it.id === id);
        if (!def || !state) return "Not found";
        if (!state.active) return "Not available";
        if (!contentWorldService.isNear(player, def.x, def.y, def.radius)) return "Too far";
        const ctx = contentWorldService.conditionContext(room, player);
        if (!evaluateConditions(ctx, def.conditions)) return "Requirements not met";

        switch (def.type) {
            case "portal":
                return transferWorldService.transfer(
                    room,
                    client,
                    player,
                    def.targetMapCode,
                    def.targetSpawnId
                );
            case "teleport":
                await this.openTeleport(room, client, player);
                return undefined;
            case "gather":
                return this.gather(room, client, player, def, state);
            case "sign": {
                const error = dialogueWorldService.startSource(room, client, player, {
                    ...def,
                    id: def.id,
                });
                if (!error) this.notifyQuest(room, client, player, def.id);
                return error;
            }
        }
    }

    private gather(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        def: Extract<MapInteractable, { type: "gather" }>,
        state: InteractableWorldState
    ): string | undefined {
        const reward = resolveRewardSpec(def.reward, ItemSource.SYSTEM);
        // Túi đầy thì không cho nhặt (thay vì nhặt xong mất đồ).
        if (!inventoryWorldService.canFit(player, reward.items)) return "Inventory full";
        state.active = false;
        room.clock.setTimeout(() => {
            state.active = true;
        }, def.respawnSec * 1000);
        rewardWorldService.grant(room, client.sessionId, player, reward);
        this.notifyQuest(room, client, player, def.id);
        return undefined;
    }

    private notifyQuest(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        id: string
    ) {
        questWorldService.onEvent(room, client.sessionId, player, {
            type: QuestObjectiveType.INTERACT,
            targetCode: id,
        });
    }

    /** Dùng bệ teleport: gửi danh sách điểm đến cho client. */
    private async openTeleport(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<void> {
        const destinations = await mapService.listTeleportDestinations(room.map.code);
        const message: TeleportListMessage = {
            destinations: destinations.map((destination) => ({
                mapCode: destination.mapCode,
                minLevel: destination.minLevel,
                open: destination.open,
                ...pickStatus(teleportStatus(destination, player.level, player.flags)),
            })),
        };
        client.send(WorldMessage.TELEPORT_LIST, message);
    }
}
