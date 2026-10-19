import { MapType } from "@/modules/maps/enums/map.enum.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface JoinPlayerWorldPayload {
    playerId: string;
}

export class JoinPlayerWorldCommand extends Command<WorldRoom, JoinPlayerWorldPayload> {
    async execute({ playerId }: JoinPlayerWorldPayload) {
        const player = await playerService.getPlayableSnapshotOrFail(playerId);
        const dungeon = this.room.dungeon;
        if (dungeon) {
            // Room dungeon chỉ nhận player có lượt vào đúng instance này (DB giữ map cũ để mất kết nối thì ra ngoài).
            const session = player.dungeonSession;
            if (
                session?.instanceId !== dungeon.instanceId ||
                session.dungeonCode !== this.room.map.code
            ) {
                throw new Error(
                    `Player has no session in dungeon instance "${dungeon.instanceId}"`
                );
            }
        } else if (player.mapCode !== this.room.map.code) {
            throw new Error(`Player is on map "${player.mapCode}", not "${this.room.map.code}"`);
        }

        const state = new PlayerWorldState({ player });
        // Lượt dungeon cũ còn sót (server tắt giữa chừng) thì bỏ, lần lưu sau sẽ xoá khỏi DB.
        state.dungeonSession = dungeon ? (player.dungeonSession ?? undefined) : undefined;
        if (this.room.map.type === MapType.TOWN) state.lastTownMapCode = this.room.map.code;

        this.room.state.players.set(playerId, state);
    }
}
