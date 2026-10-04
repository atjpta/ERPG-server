import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import {
    PlayerChainContext,
    PlayerDeathChain,
    PlayerDashChain,
    PlayerHitInterruptChain,
    PlayerMoveChain,
    PlayerAttackChain,
    PlayerTargetChain,
} from "@/rooms/world/chains/player.world.chain.js";
import { WorldChain } from "@/rooms/world/chains/world.chain.js";
import { MoveCommand } from "@/rooms/world/simulation/movement.step.js";
import { StepContext } from "colyseus";
const PLAYER_RESPAWN_MS = 5_000;

interface ButtonInput {
    targetNext: boolean;
    targetUnlock: boolean;
}

const RELEASED_BUTTONS: ButtonInput = { targetNext: false, targetUnlock: false };

export class PlayerWorldService {
    private readonly respawningPlayers = new WeakSet<PlayerWorldState>();
    private readonly previousButtons = new WeakMap<PlayerWorldState, ButtonInput>();
    private readonly attackChain = new PlayerAttackChain();
    private readonly chains = new WorldChain<PlayerChainContext>([
        new PlayerDeathChain(this.attackChain),
        new PlayerHitInterruptChain(this.attackChain),
        new PlayerDashChain(this.attackChain),
        new PlayerMoveChain(),
        new PlayerTargetChain(),
        this.attackChain,
    ]);

    /** Mỗi player tiêu thụ đúng một input trong một fixed Chain. */
    public chain(room: WorldRoom, ctx: StepContext): void {
        worldService.chainEntities(
            room.state.players,
            ([, state]) => state,
            ([sessionId], state) => {
                const input = room.inputs.get(sessionId).next();
                const buttons: ButtonInput = {
                    targetNext: input?.targetNext === true,
                    targetUnlock: input?.targetUnlock === true,
                };
                const previous = this.previousButtons.get(state) ?? RELEASED_BUTTONS;
                // Tick không có input (mất gói/jitter) thì giữ trạng thái nút cũ, tránh việc
                // input kế tiếp bị tính là một lần bấm mới.
                if (input) this.previousButtons.set(state, buttons);
                const move: MoveCommand = {
                    moveX: normalizeAxis(input?.moveX),
                    moveY: normalizeAxis(input?.moveY),
                };
                this.chains.execute({
                    room,
                    sessionId,
                    state,
                    move,
                    attackRequested: input?.attack === true,
                    dashRequested: input?.dash === true,
                    targetSwitchPressed: buttons.targetNext && !previous.targetNext,
                    targetUnlockPressed: buttons.targetUnlock && !previous.targetUnlock,
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
