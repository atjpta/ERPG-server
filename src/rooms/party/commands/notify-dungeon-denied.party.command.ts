import { ok } from "@/core/utils/result.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { broadcastDungeonDenied } from "@/rooms/party/services/party-notify.js";
import type { DungeonFailure } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

interface Payload {
    dungeonCode: string;
    failures: DungeonFailure[];
}

/** RPC từ coordinator: báo cho cả party lý do không vào được dungeon. */
export class NotifyDungeonDeniedPartyCommand extends Command<PartyRoom, Payload> {
    result: Result = ok();

    execute({ dungeonCode, failures }: Payload) {
        broadcastDungeonDenied(this.room, dungeonCode, failures);
    }
}
