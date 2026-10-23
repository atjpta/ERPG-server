import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { partyDungeonWorldService } from "@/rooms/world/modules/dungeons/services/party-dungeon.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    dungeonCode: string;
    instanceId: string;
    spawnId: string;
    retry: boolean;
}

/** RPC từ coordinator: đưa `playerId` vào instance dungeon (đã gửi `mapChange` = thành công). */
export class PartyEnterDungeonWorldCommand extends Command<WorldRoom, Payload> {
    result: Result = Response.error(CommonCode.ROOM_UNAVAILABLE);

    async execute({ playerId, dungeonCode, instanceId, spawnId, retry }: Payload) {
        const code = await partyDungeonWorldService.enterDungeon(
            this.room,
            playerId,
            dungeonCode,
            instanceId,
            spawnId,
            retry
        );
        this.result = code ? Response.error(code) : Response.success();
    }
}
