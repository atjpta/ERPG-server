import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import { transferWorldService } from "@/rooms/world/modules/maps/services/transfer.world.service.js";
import { TeleportToSchema } from "@/rooms/world/modules/maps/validators/teleport.world.validator.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
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
        const checked = this.checkPad(this.room, this.player);
        if (!Response.isError(checked)) return true;
        this.result = Response.error(checked.errorCode, { id: this.body.mapCode });
        return false;
    }

    async execute({ client }: MapPayload) {
        const id = this.body.mapCode;
        const traveled = await this.travel(this.room, client, this.player, id);
        this.result = Response.isError(traveled)
            ? Response.error(traveled.errorCode, { id })
            : Response.success<InteractResultMessage>({ id });
    }

    /** Phải còn sống, không ở dungeon và đang mở bệ teleport (`interactNpc` vào bệ) còn đứng gần nó. */
    private checkPad(room: WorldRoom, player: PlayerWorldState): Response {
        if (player.hp <= 0 || room.dungeon) return Response.error(MapErrorCode.TELEPORT_NOT_AT_PAD);
        const open = room.npcFunctions.check(
            player.id,
            NpcFunctionType.TELEPORT,
            room.state.players
        );
        return Response.isError(open)
            ? Response.error(MapErrorCode.TELEPORT_NOT_AT_PAD)
            : Response.success();
    }

    /** Chọn điểm đến. Thành công khi đã dịch chuyển / gửi `mapChange`. */
    private async travel(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        mapCode: string
    ): Promise<Response> {
        const destinations = await mapService.listTeleportDestinations(room.map.code);
        const destination = destinations.find((d) => d.mapCode === mapCode);
        if (!destination?.open) return Response.error(MapErrorCode.TELEPORT_NO_DESTINATION);
        const status = teleportService.teleportStatus(destination, player.level, player.flags);
        if (!status.discovered) return Response.error(MapErrorCode.TELEPORT_NOT_DISCOVERED);
        if (!status.levelOk) return Response.error(PlayerErrorCode.LEVEL_TOO_LOW);
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
