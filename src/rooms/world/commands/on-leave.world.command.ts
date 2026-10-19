import { playerService } from "@/modules/player/services/player.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface LeavePlayerWorldPayload {
    playerId: string;
}

export class LeavePlayerWorldCommand extends Command<WorldRoom, LeavePlayerWorldPayload> {
    async execute({ playerId }: LeavePlayerWorldPayload) {
        const player = this.room.state.players.get(playerId);
        this.room.state.players.delete(playerId);
        if (!player) return;

        try {
            await playerService.saveState(
                player.id,
                player.toSavedState(this.room.map.code),
                player.stateRevision
            );
        } catch (err) {
            console.error(`[WorldRoom] Save player ${player.id} failed:`, err);
        }
    }
}
