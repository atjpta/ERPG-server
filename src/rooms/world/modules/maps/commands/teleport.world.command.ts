import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import { TeleportToSchema } from "@/rooms/world/modules/maps/validators/teleport.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { InteractResultMessage } from "@/rooms/world/modules/content/interfaces/content.world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

interface MapPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Chọn điểm đến teleport; response mang `id` = mapCode. */
@SdkMessage({
    response: "InteractResultMessage",
    replies: [WorldMessage.MAP_CHANGE],
    errors: [
        MapErrorCode.TELEPORT_NOT_AT_PAD,
        MapErrorCode.TELEPORT_NO_DESTINATION,
        MapErrorCode.TELEPORT_NOT_DISCOVERED,
        MapErrorCode.MAP_NOT_FOUND,
        MapErrorCode.MAP_NOT_OPEN,
        MapErrorCode.MAP_ALREADY_CHANGING,
        MapErrorCode.MAP_SPAWN_NOT_FOUND,
        PlayerErrorCode.LEVEL_TOO_LOW,
    ],
    note: "Lỗi có `error: { id }`.",
})
export class TeleportToWorldCommand extends PlayerWorldCommand<
    MapPayload,
    typeof TeleportToSchema
> {
    static readonly message = WorldClientMessage.TELEPORT_TO;

    protected override readonly validateSchema = TeleportToSchema;

    validate() {
        const error = this.checkPad(this.room, this.player);
        if (!error) return true;
        this.result = Response.error(error, undefined, { id: this.body.mapCode });
        return false;
    }

    async execute({ client }: MapPayload) {
        const id = this.body.mapCode;
        const error = await this.travel(this.room, client, this.player, id);
        this.result = error
            ? Response.error(error, undefined, { id })
            : Response.success<InteractResultMessage>({ id });
    }

    /** Phải còn sống, không ở dungeon và đứng trên bệ teleport. */
    private checkPad(room: WorldRoom, player: PlayerWorldState): ErrorCode | undefined {
        if (player.hp <= 0 || room.dungeon) return MapErrorCode.TELEPORT_NOT_AT_PAD;
        const atPad = room.map.interactables.some(
            (it) => it.type === "teleport" && player.isNear(it.x, it.y, it.radius)
        );
        return atPad ? undefined : MapErrorCode.TELEPORT_NOT_AT_PAD;
    }

    /** Chọn điểm đến. Trả mã lỗi hoặc `undefined` khi đã dịch chuyển / gửi `mapChange`. */
    private async travel(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        mapCode: string
    ): Promise<ErrorCode | undefined> {
        const destinations = await mapService.listTeleportDestinations(room.map.code);
        const destination = destinations.find((d) => d.mapCode === mapCode);
        if (!destination?.open) return MapErrorCode.TELEPORT_NO_DESTINATION;
        const status = teleportService.teleportStatus(destination, player.level, player.flags);
        if (!status.discovered) return MapErrorCode.TELEPORT_NOT_DISCOVERED;
        if (!status.levelOk) return PlayerErrorCode.LEVEL_TOO_LOW;
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
