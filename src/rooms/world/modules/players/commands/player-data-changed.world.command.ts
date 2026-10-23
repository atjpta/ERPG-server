import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { PlayerDataSnapshot } from "@/rooms/global/global.shared.js";
import { playerDataWorldService } from "@/rooms/world/modules/players/services/player-data.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    data: PlayerDataSnapshot;
}

/** RPC từ global: PlayerData của một player vừa đổi (đã lưu) — world cập nhật bản sao chỉ-đọc và tính lại stats. */
export class PlayerDataChangedWorldCommand extends Command<WorldRoom, Payload> {
    result: Result = Response.success();

    execute({ playerId, data }: Payload) {
        playerDataWorldService.applySnapshot(this.room, playerId, data);
    }
}
