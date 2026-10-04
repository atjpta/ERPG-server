import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { MoveWorldInput } from "@/rooms/world/schema/move.world.input.js";
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
/** Tối đa bao nhiêu input của 1 player được xử lý trong 1 tick khi đang đuổi theo input bị dồn. */
const MAX_INPUT_STEPS_PER_TICK = 4;
/**
 * Số step "để dành" tối đa (40 = 1 s ở 40 Hz). Mỗi tick player được thêm 1 step; mạng khựng thì
 * input dồn lại và được xử lý bù bằng phần để dành — nhưng tổng số input không bao giờ vượt thời
 * gian thật, nên client gửi input nhanh hơn 40 Hz cũng không đi nhanh hơn được.
 */
const MAX_BANKED_INPUT_STEPS = 40;

interface ButtonInput {
    targetNext: boolean;
    targetUnlock: boolean;
}

const RELEASED_BUTTONS: ButtonInput = { targetNext: false, targetUnlock: false };

export class PlayerWorldService {
    private readonly respawningPlayers = new WeakSet<PlayerWorldState>();
    private readonly previousButtons = new WeakMap<PlayerWorldState, ButtonInput>();
    private readonly bankedSteps = new WeakMap<PlayerWorldState, number>();
    private readonly attackChain = new PlayerAttackChain();
    private readonly chains = new WorldChain<PlayerChainContext>([
        new PlayerDeathChain(this.attackChain),
        new PlayerHitInterruptChain(this.attackChain),
        new PlayerDashChain(this.attackChain),
        new PlayerMoveChain(),
        new PlayerTargetChain(),
        this.attackChain,
    ]);

    /**
     * Mỗi input của client = đúng một step mô phỏng, giống `WorldMovementStep.Apply` bên client.
     * Tick không có input thì player không bước (client cũng chưa bước) — input tới trễ được xử lý
     * bù ở các tick sau, nên state server luôn khớp state client predict ở cùng input, không bị
     * reconcile kéo lại, và độ trễ không tích luỹ khi mạng chập chờn.
     */
    public chain(room: WorldRoom, ctx: StepContext): void {
        for (const [sessionId, state] of room.state.players) {
            const inputs = room.inputs.get(sessionId);
            const banked = Math.min((this.bankedSteps.get(state) ?? 0) + 1, MAX_BANKED_INPUT_STEPS);
            const maxSteps = Math.min(banked, MAX_INPUT_STEPS_PER_TICK);
            let steps = 0;
            while (steps < maxSteps) {
                const input = inputs.next();
                if (!input) break;
                this.step(room, sessionId, state, input, ctx.dt);
                steps++;
            }
            this.bankedSteps.set(state, banked - steps);

            // Không có input nhưng đã hết máu (bị monster đánh) → vẫn phải xử lý chết/hồi sinh.
            if (steps === 0 && state.hp <= 0) this.step(room, sessionId, state, undefined, ctx.dt);
        }
    }

    private step(
        room: WorldRoom,
        sessionId: string,
        state: PlayerWorldState,
        input: MoveWorldInput | undefined,
        dt: number
    ): void {
        const buttons: ButtonInput = {
            targetNext: input?.targetNext === true,
            targetUnlock: input?.targetUnlock === true,
        };
        const previous = this.previousButtons.get(state) ?? RELEASED_BUTTONS;
        if (input) this.previousButtons.set(state, buttons);
        const move: MoveCommand = {
            moveX: normalizeAxis(input?.moveX),
            moveY: normalizeAxis(input?.moveY),
        };

        // `attacking` chỉ true ở step bắt đầu đòn; cooldown giảm sau mỗi step — cùng thứ tự với client.
        state.attacking = false;
        this.chains.execute({
            room,
            sessionId,
            state,
            move,
            attackRequested: input?.attack === true,
            dashRequested: input?.dash === true,
            targetSwitchPressed: buttons.targetNext && !previous.targetNext,
            targetUnlockPressed: buttons.targetUnlock && !previous.targetUnlock,
            dt,
            scheduleRespawn: (player) => this.scheduleRespawn(room, player),
        });
        if (state.attackCooldownTicks > 0) state.attackCooldownTicks--;
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
