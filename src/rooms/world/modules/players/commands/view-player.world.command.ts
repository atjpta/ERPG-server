import { Response } from "@/core/utils/response.util.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { inventoryGlobalService } from "@/rooms/global/global.shared.js";
import { PlayerTargetSchema } from "@/rooms/world/modules/players/validators/player-target.world.validator.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { PlayerViewMessage } from "@/rooms/world/modules/players/interfaces/player.world.message.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    response: "PlayerViewMessage",
    errors: [PlayerErrorCode.PLAYER_NOT_HERE],
})
export class ViewPlayerWorldCommand extends PlayerWorldCommand<
    { client: PlayerClient; payload: unknown },
    typeof PlayerTargetSchema
> {
    static readonly message = WorldClientMessage.VIEW_PLAYER;

    protected override readonly validateSchema = PlayerTargetSchema;

    private target!: PlayerWorldState;

    validate() {
        const target = [...this.room.state.players.values()].find(
            (player) => player.id === this.body.playerId
        );
        if (!target) {
            this.result = Response.error(PlayerErrorCode.PLAYER_NOT_HERE);
            return false;
        }
        this.target = target;
        return true;
    }

    execute() {
        const target = this.target;
        this.result = Response.success<PlayerViewMessage>({
            playerId: target.id,
            name: target.name,
            level: target.level,
            classCode: target.classCode,
            baseClassCode: target.baseClassCode,
            equipments: inventoryGlobalService.toEquipmentsMessage(target.equipments),
            attributes: { ...target.attributes },
            stats: { ...target.stats },
        });
    }
}
