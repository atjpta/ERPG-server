import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import {
    PlayerChainContext,
    PlayerDeathChain,
    PlayerDashChain,
    PlayerMoveChain,
    PlayerAttackChain,
} from "@/rooms/world/chains/player.world.chain.js";
import { WorldChain } from "@/rooms/world/chains/world.chain.js";
import { MoveCommand } from "@/rooms/world/simulation/movement.step.js";
import { StepContext } from "colyseus";
const PLAYER_RESPAWN_MS = 5_000;

export class PlayerWorldService {
    private readonly lastMovementDiagnosticAt = new WeakMap<WorldRoom, number>();
    private readonly respawningPlayers = new WeakSet<PlayerWorldState>();
    private readonly chains = new WorldChain<PlayerChainContext>([
        new PlayerDeathChain(),
        new PlayerDashChain(),
        new PlayerMoveChain(),
        new PlayerAttackChain(),
    ]);

    /** Mỗi player tiêu thụ đúng một input trong một fixed Chain. */
    public chain(room: WorldRoom, ctx: StepContext): void {
        worldService.chainEntities(
            room.state.players,
            ([, state]) => state,
            ([sessionId], state) => {
                const input = room.inputs.get(sessionId).next() ?? {
                    moveX: 0,
                    moveY: 0,
                    attack: false,
                    dash: false,
                };
                if (input && (input.moveX !== 0 || input.moveY !== 0)) {
                    const now = Date.now();
                    const lastDiagnosticAt = this.lastMovementDiagnosticAt.get(room) ?? 0;
                    if (now - lastDiagnosticAt >= 1000) {
                        this.lastMovementDiagnosticAt.set(room, now);
                    }
                }
                const move: MoveCommand = {
                    moveX: normalizeAxis(input.moveX),
                    moveY: normalizeAxis(input.moveY),
                };
                this.chains.execute({
                    room,
                    state,
                    move,
                    attackRequested: input.attack === true,
                    dashRequested: input.dash === true,
                    dt: ctx.dt,
                    scheduleRespawn: (player) => this.scheduleRespawn(room, player),
                });
            }
        );
    }

    private scheduleRespawn(room: WorldRoom, player: PlayerWorldState): void {
        if (this.respawningPlayers.has(player)) return;

        this.respawningPlayers.add(player);
        room.clock.setTimeout(() => {
            player.setSpawns();
            this.respawningPlayers.delete(player);
        }, PLAYER_RESPAWN_MS);
    }
}

export const playerWorldService = new PlayerWorldService();

const normalizeAxis = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.max(-1, Math.min(1, Math.trunc(value)))
        : 0;
