import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { dungeonPartyCoordinator } from "@/rooms/coordinators/dungeon-party.coordinator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import {
    WorldClientMessage,
    WorldMessage,
    type DungeonRetryResultMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

export class DungeonRetryWorldCommand extends Command<WorldRoom, { client: PlayerClient }> {
    static readonly message = WorldClientMessage.DUNGEON_RETRY;

    async execute({ client }: { client: PlayerClient }) {
        const player = this.room.state.players.get(client.sessionId);
        if (this.room.isDungeon && player) await this.retryDungeon(this.room, client, player);
    }

    /**
     * "Đi lại" sau khi clear dungeon: chỉ chủ party bấm được (solo = tự là chủ), và mọi thành viên phải
     * còn ở dungeon này — có ai đã thoát thì không đi. Lỗi báo bằng `dungeonRetryResult`; thành công thì
     * party room ra lệnh `mapChange` cho cả nhóm vào chung một instance mới.
     */
    private async retryDungeon(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState
    ): Promise<void> {
        const reply = (result: DungeonRetryResultMessage) =>
            client.send(WorldMessage.DUNGEON_RETRY_RESULT, result);
        if (!room.dungeon?.cleared || player.pendingMapCode) return;
        const partyRoomId = await playerPartyWorldService.ensureParty(room, player);
        if (!partyRoomId) return reply({ ok: false, error: "unavailable" });
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
        if (result.error === "unavailable") return reply({ ok: false, error: "unavailable" });
        if (!result.ok) reply({ ok: false, error: result.error ?? "unavailable" });
    }
}
