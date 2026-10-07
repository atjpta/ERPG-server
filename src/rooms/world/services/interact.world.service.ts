import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MapInteractable } from "@/modules/maps/entities/game-map.entity.js";
import { evaluateConditions } from "@/modules/dialogues/utils/condition.util.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { resolveRewardSpec } from "@/modules/rewards/utils/reward-spec.util.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { InteractableWorldState } from "@/rooms/world/schema/interactable.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { contentWorldService } from "@/rooms/world/services/content.world.service.js";
import { dialogueWorldService } from "@/rooms/world/services/dialogue.world.service.js";
import { inventoryWorldService } from "@/rooms/world/services/inventory.world.service.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import { transferWorldService } from "@/rooms/world/services/transfer.world.service.js";
import { WorldMessage, type InteractResultMessage } from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Vật thể tương tác được trong map: portal, thu thập, biển báo. */
export class InteractWorldService {
    /** Dựng state từ `game_maps.interactables` lúc tạo room. */
    build(room: WorldRoom): InteractableWorldState[] {
        return room.map.interactables.map(
            (it) => new InteractableWorldState({ id: it.id, kind: it.type, x: it.x, y: it.y })
        );
    }

    async interact(
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
}

export const interactWorldService = new InteractWorldService();
