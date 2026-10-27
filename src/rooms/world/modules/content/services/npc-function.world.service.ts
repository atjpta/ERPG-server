import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import type { MapNpc } from "@/modules/maps/types/game-map.type.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import {
    NpcFunctionType,
    type NpcFunction,
    type NpcFunctionOf,
} from "@/modules/npcs/schemas/npc-function.schema.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { rewardSpecService } from "@/modules/rewards/services/reward-spec.service.js";
import type { NpcFunctionOpenMessage } from "@/rooms/world/modules/content/interfaces/content.world.message.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { TeleportListMessage } from "@/rooms/world/modules/maps/interfaces/map.world.message.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/**
 * Chạy một chức năng của NPC / vật thể (`MapNpc` + `NpcFunction`) ở world room: dùng chung cho thoại (`open_function`) và cho vật thể
 * `autoOpen` (`interactNpc`). Chức năng cần vị trí / map / state room thì chạy ngay ở đây (portal, teleport, gather); chức năng
 * UI thì ghi phiên (`room.npcFunctions`) rồi báo client mở màn hình — phần việc thật (ví / túi) ở global room chỉ chạy khi phiên còn hiệu lực.
 */
export class NpcFunctionWorldService {
    async open(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        slot: MapNpc,
        fn: NpcFunction
    ): Promise<Response> {
        switch (fn.type) {
            case NpcFunctionType.PORTAL:
                return transferWorldService.transfer(
                    room,
                    client,
                    player,
                    fn.config.targetMapCode,
                    fn.config.targetSpawnId
                );
            case NpcFunctionType.GATHER:
                return this.gather(room, client, player, slot, fn.config);
            case NpcFunctionType.TELEPORT:
                this.begin(room, client, slot, fn);
                await this.sendTeleportList(room, client, player);
                return Response.success();
            default: {
                this.begin(room, client, slot, fn);
                const message: NpcFunctionOpenMessage = {
                    npcCode: slot.npcCode,
                    slotId: slot.id,
                    functionId: fn.id,
                    type: fn.type,
                    config: JSON.stringify(fn.config),
                };
                RoomResponse.send(client, WorldMessage.NPC_FUNCTION_OPEN, message);
                return Response.success();
            }
        }
    }

    /** Ghi phiên: từ giờ tới khi đi xa, các lệnh của chức năng này (kể cả ở global qua rpc) mới được chạy. */
    private begin(room: WorldRoom, client: PlayerClient, slot: MapNpc, fn: NpcFunction) {
        room.npcFunctions.open(client.auth.playerId, {
            npcCode: slot.npcCode,
            slotId: slot.id,
            functionId: fn.id,
            type: fn.type,
            config: fn.config,
            x: slot.x,
            y: slot.y,
            radius: npcService.radiusOf(slot),
        });
    }

    /** Vật thể thu thập: nhặt quà (túi đầy thì không nhặt), ẩn đi `respawnSec` giây rồi hiện lại. */
    private async gather(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        slot: MapNpc,
        config: NpcFunctionOf<NpcFunctionType.GATHER>["config"]
    ): Promise<Response> {
        const state = room.state.npcs.find((npc) => npc.id === slot.id);
        if (!state) return Response.error(NpcErrorCode.NPC_NOT_IN_MAP);
        const reward = rewardSpecService.resolveRewardSpec(config.reward, ItemSource.SYSTEM);
        // Giữ chỗ trước để người khác không nhặt trùng; thất bại thì trả lại.
        state.active = false;
        // Túi đầy thì không cho nhặt (thay vì nhặt xong mất đồ): kiểm tra và cộng item cùng lúc.
        if (reward.items.length > 0) {
            const given = player.applyOps([
                { type: "giveItem", items: reward.items, source: reward.source, requireFit: true },
            ]);
            if (Response.isError(given)) {
                state.active = true;
                return given;
            }
        }
        room.clock.setTimeout(() => {
            state.active = true;
        }, config.respawnSec * 1000);
        rewardWorldService.grant(room, client.auth.playerId, player, reward, false, false);
        questWorldService.onEvent(room, client.auth.playerId, player, {
            type: QuestObjectiveType.INTERACT,
            targetCode: slot.id,
        });
        return Response.success();
    }

    /** Dùng bệ teleport: gửi danh sách điểm đến cho client. */
    private async sendTeleportList(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<void> {
        const destinations = await mapService.listTeleportDestinations(room.map.code);
        const message: TeleportListMessage = {
            destinations: destinations.map((destination) => {
                const { discovered, available } = teleportService.teleportStatus(
                    destination,
                    player.level,
                    player.flags
                );
                return {
                    mapCode: destination.mapCode,
                    minLevel: destination.minLevel,
                    open: destination.open,
                    discovered,
                    available,
                };
            }),
        };
        RoomResponse.send(client, WorldMessage.TELEPORT_LIST, message);
    }
}

export const npcFunctionWorldService = new NpcFunctionWorldService();
