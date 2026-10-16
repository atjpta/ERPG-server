import { Command } from "@colyseus/command";
import { playerService } from "@/modules/player/user/services/player.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface LeavePlayerWorldPayload {
    sessionId: string;
}

export class LeavePlayerWorldCommand extends Command<WorldRoom, LeavePlayerWorldPayload> {
    async execute({ sessionId }: LeavePlayerWorldPayload) {
        const player = this.room.state.players.get(sessionId);
        this.room.state.players.delete(sessionId);
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
