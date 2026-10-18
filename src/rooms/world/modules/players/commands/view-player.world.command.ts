import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { sendFail, sendOk } from "@/core/utils/room-send.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { toEquipmentsMessage } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { PlayerTargetSchema } from "@/rooms/world/modules/players/validators/player-target.world.validator.js";
import {
    WorldClientMessage,
    WorldMessage,
    type PlayerViewMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

export class ViewPlayerWorldCommand extends Command<
    WorldRoom,
    { client: PlayerClient; payload: unknown }
> {
    static readonly message = WorldClientMessage.VIEW_PLAYER;

    execute({ client, payload }: { client: PlayerClient; payload: unknown }) {
        const parsed = PlayerTargetSchema.safeParse(payload);
        if (!parsed.success) return;
        const room = this.room,
            targetPlayerId = parsed.data.playerId;
        const target = [...room.state.players.values()].find(
            (player) => player.id === targetPlayerId
        );
        if (!target) {
            sendFail(client, WorldMessage.PLAYER_VIEW, PlayerErrorCode.PLAYER_NOT_HERE);
            return;
        }
        const summary = target.getAttributeSummary();
        const message: PlayerViewMessage = {
            playerId: target.id,
            name: target.name,
            level: target.level,
            classCode: target.classCode,
            baseClassCode: target.baseClassCode,
            equipments: toEquipmentsMessage(target.equipments),
            attributes: summary.attributes,
            stats: summary.stats,
        };
        sendOk(client, WorldMessage.PLAYER_VIEW, message);
    }
}
