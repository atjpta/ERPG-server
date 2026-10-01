import { Command } from "@colyseus/command";
import type { Direction } from "@/modules/player/enums/player.enum.js";
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
                {
                    mapCode: this.room.map.code,
                    x: player.x,
                    y: player.y,
                    direction: player.direction as Direction,
                    hp: player.hp,
                    mp: player.mp,
                },
                player.stateRevision
            );
        } catch (err) {
            console.error(`[WorldRoom] Save player ${player.id} failed:`, err);
        }
    }
}
