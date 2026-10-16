import { teleportStatus, type TeleportStatus } from "@/modules/maps/utils/teleport.util.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { contentWorldService } from "@/rooms/world/content/services/content.world.service.js";
import { transferWorldService } from "@/rooms/world/maps/services/transfer.world.service.js";
import {
    MapTransferError,
    WorldMessage,
    type TeleportListMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/**
 * Teleport = dịch chuyển nhanh: dùng bệ teleport (`interact`) thì nhận danh sách map có bệ teleport, rồi
 * chọn (`teleportTo`) để tới ngay bệ teleport của map đó. Server kiểm lại mọi lần: đang đứng gần một bệ
 * teleport của map hiện tại, còn sống, không ở dungeon, **đã từng đến map đích**, đủ level vào map đích.
 */
const pickStatus = ({ discovered, available }: TeleportStatus) => ({ discovered, available });

export class TeleportWorldService {
    /** Dùng bệ teleport: gửi danh sách điểm đến cho client. */
    async open(room: WorldRoom, client: PlayerClient, player: PlayerWorldState): Promise<void> {
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

    /** Chọn điểm đến. Trả mã lỗi hoặc `undefined` khi đã dịch chuyển / gửi `mapChange`. */
    async travel(
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

export const teleportWorldService = new TeleportWorldService();
