import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { teleportStatus } from "@/modules/maps/services/teleport.service.js";
import { contentWorldService } from "@/rooms/world/modules/content/services/content.world.service.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import { TeleportToSchema } from "@/rooms/world/modules/maps/validators/teleport.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    MapTransferError,
    WorldClientMessage,
    WorldMessage,
    type InteractResultMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface MapPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Chọn điểm đến teleport; kết quả trả qua `interactResult` (id = mapCode). */
export class TeleportToWorldCommand extends Command<WorldRoom, MapPayload> {
    static readonly message = WorldClientMessage.TELEPORT_TO;

    async execute({ client, payload }: MapPayload) {
        const player = this.room.state.players.get(client.sessionId);
        const parsed = TeleportToSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        const error = await this.travel(this.room, client, player, parsed.data.mapCode);
        const message: InteractResultMessage = {
            ok: !error,
            id: parsed.data.mapCode,
            ...(error ? { error } : {}),
        };
        client.send(WorldMessage.INTERACT_RESULT, message);
    }

    /** Chọn điểm đến. Trả mã lỗi hoặc `undefined` khi đã dịch chuyển / gửi `mapChange`. */
    private async travel(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        mapCode: string
    ): Promise<string | undefined> {
        if (player.hp <= 0 || room.dungeon) return MapTransferError.NOT_AT_TELEPORT;
        const atPad = room.map.interactables.some(
            (it) =>
                it.type === "teleport" && contentWorldService.isNear(player, it.x, it.y, it.radius)
        );
        if (!atPad) return MapTransferError.NOT_AT_TELEPORT;

        const destinations = await mapService.listTeleportDestinations(room.map.code);
        const destination = destinations.find((d) => d.mapCode === mapCode);
        if (!destination?.open) return MapTransferError.NO_DESTINATION;
        const status = teleportStatus(destination, player.level, player.flags);
        if (!status.discovered) return MapTransferError.MAP_NOT_DISCOVERED;
        if (!status.levelOk) return MapTransferError.LEVEL_TOO_LOW;
        return transferWorldService.transfer(
            room,
            client,
            player,
            destination.mapCode,
            destination.teleportId!,
            { x: destination.x!, y: destination.y! }
        );
    }
}
