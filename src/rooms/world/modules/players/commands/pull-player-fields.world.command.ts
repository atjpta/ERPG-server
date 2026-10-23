import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { PlayerWorldView } from "@/rooms/global/global.shared.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** RPC từ global: lấy level / ví mới nhất của một player trước khi global chạy thao tác cần đến. */
export class PullPlayerFieldsWorldCommand extends Command<WorldRoom, { playerId: string }> {
    result: Result<PlayerWorldView> = Response.error(CommonCode.ROOM_UNAVAILABLE);

    execute({ playerId }: { playerId: string }) {
        const player = this.room.state.players.get(playerId);
        this.result = player
            ? Response.success({ level: player.level, wallet: structuredClone(player.wallet) })
            : Response.error(CommonCode.ROOM_UNAVAILABLE);
    }
}
