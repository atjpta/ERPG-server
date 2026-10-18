import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { WorldErrorCode } from "@/rooms/world/types/world-error-code.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { sendFail, sendOk } from "@/core/utils/room-send.util.js";
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
@SdkMessage({
    replies: [WorldMessage.INTERACT_RESULT],
    errors: [
        CommonCode.INVALID_INPUT,
        CommonCode.NOT_FOUND,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.TOO_FAR,
        PlayerErrorCode.REQUIREMENTS_NOT_MET,
        ItemErrorCode.INVENTORY_FULL,
        WorldErrorCode.INTERACT_NOT_AVAILABLE,
        MapErrorCode.MAP_NOT_FOUND,
        MapErrorCode.MAP_NOT_OPEN,
        MapErrorCode.MAP_ALREADY_CHANGING,
        MapErrorCode.MAP_SPAWN_NOT_FOUND,
        PlayerErrorCode.LEVEL_TOO_LOW,
    ],
    note: "Thành công kèm thêm message hiệu ứng (`mapChange`, `teleportList`, `dialogue`, `reward`...). Lỗi có `error: { id }`.",
})
export class InteractWorldCommand extends Command<WorldRoom, ContentPayload> {
    static readonly message = WorldClientMessage.INTERACT;

    async execute({ client, payload }: ContentPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;
        const parsed = InteractSchema.safeParse(payload);
        if (!parsed.success) {
            sendFail(client, WorldMessage.INTERACT_RESULT, CommonCode.INVALID_INPUT, { id: "" });
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
        if (error) sendFail(client, WorldMessage.INTERACT_RESULT, error, { id });
        else sendOk(client, WorldMessage.INTERACT_RESULT, { id } satisfies InteractResultMessage);
    }

    private async run(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        id: string
    ): Promise<ErrorCode | undefined> {
        if (player.hp <= 0) return PlayerErrorCode.PLAYER_DEAD;
        const def = room.map.interactables.find((it) => it.id === id);
        const state = room.state.interactables.find((it) => it.id === id);
        if (!def || !state) return CommonCode.NOT_FOUND;
        if (!state.active) return WorldErrorCode.INTERACT_NOT_AVAILABLE;
        if (!contentWorldService.isNear(player, def.x, def.y, def.radius))
            return PlayerErrorCode.TOO_FAR;
        const ctx = contentWorldService.conditionContext(room, player);
        if (!evaluateConditions(ctx, def.conditions)) return PlayerErrorCode.REQUIREMENTS_NOT_MET;

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
    ): ErrorCode | undefined {
        const reward = resolveRewardSpec(def.reward, ItemSource.SYSTEM);
        // Túi đầy thì không cho nhặt (thay vì nhặt xong mất đồ).
        if (!inventoryWorldService.canFit(player, reward.items))
            return ItemErrorCode.INVENTORY_FULL;
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
        sendOk(client, WorldMessage.TELEPORT_LIST, message);
    }
}
