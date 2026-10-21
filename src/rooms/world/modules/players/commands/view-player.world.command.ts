import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import { PlayerTargetSchema } from "@/rooms/world/modules/players/validators/player-target.world.validator.js";
import {
    WorldClientMessage,
    WorldMessage,
    type PlayerViewMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

@SdkMessage({
    replies: [WorldMessage.PLAYER_VIEW],
    errors: [PlayerErrorCode.PLAYER_NOT_HERE],
})
export class ViewPlayerWorldCommand extends PlayerWorldCommand<
    { client: PlayerClient; payload: unknown },
    typeof PlayerTargetSchema
> {
    static readonly message = WorldClientMessage.VIEW_PLAYER;

    protected override readonly validateSchema = PlayerTargetSchema;

    private target!: PlayerWorldState;

    validate({ client }: { client: PlayerClient }) {
        const target = [...this.room.state.players.values()].find(
            (player) => player.id === this.body.playerId
        );
        if (!target) {
            client.sendError(WorldMessage.PLAYER_VIEW, PlayerErrorCode.PLAYER_NOT_HERE);
            return false;
        }
        this.target = target;
        return true;
    }

    execute({ client }: { client: PlayerClient }) {
        const target = this.target;
        const summary = target.getAttributeSummary();
        const message: PlayerViewMessage = {
            playerId: target.id,
            name: target.name,
            level: target.level,
            classCode: target.classCode,
            baseClassCode: target.baseClassCode,
            equipments: inventoryWorldService.toEquipmentsMessage(target.equipments),
            attributes: summary.attributes,
            stats: summary.stats,
        };
        client.sendSuccess(WorldMessage.PLAYER_VIEW, message);
    }
}
