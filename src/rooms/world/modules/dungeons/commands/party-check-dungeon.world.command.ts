import { partyDungeonWorldService } from "@/rooms/world/modules/dungeons/services/party-dungeon.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    dungeonCode: string;
    retry: boolean;
}

/** RPC từ coordinator: `playerId` có vào được dungeon không. Kết quả: mã lỗi, hoặc `undefined` = được. */
export class PartyCheckDungeonWorldCommand extends Command<WorldRoom, Payload> {
    result: string | undefined = "offline";

    async execute({ playerId, dungeonCode, retry }: Payload) {
        this.result = await partyDungeonWorldService.checkDungeon(
            this.room,
            playerId,
            dungeonCode,
            retry
        );
    }
}
