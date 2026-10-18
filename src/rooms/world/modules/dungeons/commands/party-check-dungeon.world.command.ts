import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { partyDungeonWorldService } from "@/rooms/world/modules/dungeons/services/party-dungeon.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    dungeonCode: string;
    retry: boolean;
}

/** RPC từ coordinator: `playerId` có vào được dungeon không. */
export class PartyCheckDungeonWorldCommand extends Command<WorldRoom, Payload> {
    result: Result = fail(CommonCode.ROOM_UNAVAILABLE);

    async execute({ playerId, dungeonCode, retry }: Payload) {
        const code = await partyDungeonWorldService.checkDungeon(
            this.room,
            playerId,
            dungeonCode,
            retry
        );
        this.result = code ? fail(code) : ok();
    }
}
