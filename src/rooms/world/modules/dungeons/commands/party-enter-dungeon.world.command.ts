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

/** RPC từ coordinator: đưa `playerId` vào instance dungeon. Kết quả: mã lỗi, hoặc `undefined` = đã gửi `mapChange`. */
export class PartyEnterDungeonWorldCommand extends Command<WorldRoom, Payload> {
    result: string | undefined = "offline";

    async execute({ playerId, dungeonCode, instanceId, spawnId, retry }: Payload) {
        this.result = await partyDungeonWorldService.enterDungeon(
            this.room,
            playerId,
            dungeonCode,
            instanceId,
            spawnId,
            retry
        );
    }
}
