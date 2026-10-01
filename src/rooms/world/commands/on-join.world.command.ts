import { Command } from "@colyseus/command";
import { playerService } from "@/modules/player/user/services/player.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";

interface JoinPlayerWorldPayload {
    sessionId: string;
    playerId: string;
}

export class JoinPlayerWorldCommand extends Command<WorldRoom, JoinPlayerWorldPayload> {
    async execute({ sessionId, playerId }: JoinPlayerWorldPayload) {
        const player = await playerService.getPlayableSnapshotOrFail(playerId);
        if (player.mapCode !== this.room.map.code) {
            throw new Error(`Player is on map "${player.mapCode}", not "${this.room.map.code}"`);
        }

        const state = new PlayerWorldState({ player });

        this.room.state.players.set(sessionId, state);
    }
}
