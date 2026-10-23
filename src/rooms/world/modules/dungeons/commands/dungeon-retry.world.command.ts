import { callRoom } from "@/core/rooms/room.integration.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { Response } from "@/core/utils/response.util.js";
import {
    DUNGEON_LAUNCH_TIMEOUT_MS,
    LaunchDungeonGlobalCommand,
    PartyErrorCode,
} from "@/rooms/global/global.shared.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldCommand } from "@/rooms/world/player.world.command.js";

@SdkMessage({
    replies: [WorldMessage.MAP_CHANGE],
    errors: [
        MapErrorCode.DUNGEON_UNAVAILABLE,
        MapErrorCode.DUNGEON_NOT_TOGETHER,
        MapErrorCode.DUNGEON_DENIED,
        PartyErrorCode.PARTY_NOT_LEADER,
    ],
    note: "Response chỉ báo đã gửi lệnh đi lại; việc vào instance mới đến qua `mapChange`.",
})
export class DungeonRetryWorldCommand extends PlayerWorldCommand<{ client: PlayerClient }> {
    static readonly message = WorldClientMessage.DUNGEON_RETRY;

    validate() {
        if (!!this.room.dungeon?.cleared && !this.player.pendingMapCode) return true;
        this.result = Response.error(MapErrorCode.DUNGEON_UNAVAILABLE);
        return false;
    }

    async execute() {
        this.result = await this.retryDungeon(this.room, this.player);
    }

    /**
     * "Đi lại" sau khi clear dungeon: chỉ chủ party bấm được (solo = tự là chủ), và mọi thành viên phải
     * còn ở dungeon này — có ai đã thoát thì không đi. Lỗi trả qua response (`Result` thất bại); thành công
     * thì global room ra lệnh `mapChange` cho cả nhóm vào chung một instance mới.
     */
    private async retryDungeon(room: WorldRoom, player: PlayerWorldState) {
        // Người đã bấm thoát đang chờ chuyển map nên không còn tính là ở đây.
        const present = [...room.state.players.values()]
            .filter((other) => !other.pendingMapCode)
            .map((other) => other.id);
        const result = await callRoom(
            room.serverId,
            LaunchDungeonGlobalCommand,
            {
                leaderPlayerId: player.id,
                code: room.map.code,
                spawnId: "default",
                retry: true,
                presentPlayerIds: present,
            },
            { timeoutMs: DUNGEON_LAUNCH_TIMEOUT_MS }
        );
        if (Response.isError(result)) {
            return Response.error(
                result.code === CommonCode.ROOM_UNAVAILABLE
                    ? MapErrorCode.DUNGEON_UNAVAILABLE
                    : result.code
            );
        }
        return Response.success();
    }
}
