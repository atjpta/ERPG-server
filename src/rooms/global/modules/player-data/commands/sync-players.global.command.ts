import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import type {
    PlayerSyncEntry,
    PlayerSyncEntryResult,
} from "@/rooms/global/modules/player-data/types/player-data.type.js";
import { Command } from "@colyseus/command";

interface Payload {
    entries: PlayerSyncEntry[];
}

/**
 * RPC từ world: backup phần world làm chủ (vị trí, level, ví, quest...) — global gộp vào bản ghi, lưu DB và trả
 * revision mới (kèm snapshot PlayerData nếu world đang giữ bản cũ hơn).
 */
export class SyncPlayersGlobalCommand extends Command<GlobalRoom, Payload> {
    result: Result<PlayerSyncEntryResult[]> = Response.error(CommonCode.ROOM_UNAVAILABLE);

    async execute({ entries }: Payload) {
        this.result = Response.success(
            await playerDataGlobalService.syncEntries(this.room, entries)
        );
    }
}
