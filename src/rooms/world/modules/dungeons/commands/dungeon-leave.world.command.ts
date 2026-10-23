import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dungeonWorldService } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    replies: [WorldMessage.MAP_CHANGE],
    note: "Không ở trong dungeon thì không có reply.",
})
export class DungeonLeaveWorldCommand extends PlayerWorldCommand<{ client: PlayerClient }> {
    static readonly message = WorldClientMessage.DUNGEON_LEAVE;

    validate() {
        return this.room.dungeon !== undefined;
    }

    /** Client chủ động rời dungeon. */
    async execute({ client }: { client: PlayerClient }) {
        await dungeonWorldService.leave(this.room, client, this.player, "return");
    }
}
