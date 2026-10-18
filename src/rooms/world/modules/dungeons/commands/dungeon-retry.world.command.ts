import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { isFail } from "@/core/utils/result.util.js";
import { sendFail } from "@/core/utils/room-send.util.js";
import { dungeonPartyCoordinator } from "@/rooms/coordinators/dungeon-party.coordinator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

@SdkMessage({
    replies: [WorldMessage.DUNGEON_RETRY_RESULT, WorldMessage.MAP_CHANGE],
    errors: [
        MapErrorCode.DUNGEON_UNAVAILABLE,
        MapErrorCode.DUNGEON_NOT_TOGETHER,
        MapErrorCode.DUNGEON_DENIED,
        PartyErrorCode.PARTY_NOT_LEADER,
    ],
    note: "Chỉ lỗi mới trả `dungeonRetryResult`; thành công thì `mapChange` đến thay.",
})
export class DungeonRetryWorldCommand extends Command<WorldRoom, { client: PlayerClient }> {
    static readonly message = WorldClientMessage.DUNGEON_RETRY;

    async execute({ client }: { client: PlayerClient }) {
        const player = this.room.state.players.get(client.sessionId);
        if (this.room.isDungeon && player) await this.retryDungeon(this.room, client, player);
    }

    /**
     * "Đi lại" sau khi clear dungeon: chỉ chủ party bấm được (solo = tự là chủ), và mọi thành viên phải
     * còn ở dungeon này — có ai đã thoát thì không đi. Lỗi báo bằng `dungeonRetryResult` (`Result` thất
     * bại); thành công thì party room ra lệnh `mapChange` cho cả nhóm vào chung một instance mới.
     */
    private async retryDungeon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<void> {
        const refuse = (code: ErrorCode) =>
            sendFail(client, WorldMessage.DUNGEON_RETRY_RESULT, code);
        if (!room.dungeon?.cleared || player.pendingMapCode) return;
        const partyRoomId = await playerPartyWorldService.ensureParty(room, player);
        if (!partyRoomId) return refuse(MapErrorCode.DUNGEON_UNAVAILABLE);
        // Người đã bấm thoát đang chờ chuyển map nên không còn tính là ở đây.
        const present = [...room.state.players.values()]
            .filter((other) => !other.pendingMapCode)
            .map((other) => other.id);
        const result = await dungeonPartyCoordinator.launch(partyRoomId, {
            leaderPlayerId: player.id,
            code: room.map.code,
            spawnId: "default",
            retry: true,
            presentPlayerIds: present,
        });
        if (isFail(result)) {
            refuse(
                result.code === CommonCode.ROOM_UNAVAILABLE
                    ? MapErrorCode.DUNGEON_UNAVAILABLE
                    : result.code
            );
        }
    }
}
