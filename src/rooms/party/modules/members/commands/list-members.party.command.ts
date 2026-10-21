import { ok } from "@/core/utils/result.util.js";
import type { Result } from "@/core/types/result.type.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { Command } from "@colyseus/command";

/** RPC từ chat room (kênh party): danh sách `playerId` thành viên party. */
export class ListMembersPartyCommand extends Command<PartyRoom, Record<string, never>> {
    result: Result<{ playerIds: string[] }> = ok({ playerIds: [] });

    execute() {
        this.result = ok({ playerIds: this.room.state.joinOrder });
    }
}
