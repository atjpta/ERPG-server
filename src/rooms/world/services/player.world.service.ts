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
 * Ngân sách step theo THỜI GIAN THẬT (đồng hồ room), không theo số tick: `setFixedTimestep` bỏ
 * thời gian khi server khựng quá 5 step (GC, ghi DB, timer Windows…), còn client vẫn gửi đủ
 * 40 input/giây thật — tính theo tick thì input sẽ tồn mãi, cửa sổ chưa ack dài ra tới khi tràn
 * buffer (128) và client bị reconcile kéo lùi. Mỗi 25 ms thật +1, mỗi input xử lý −1:
 * - Để dành tối đa 40 (1 s): mạng khựng thì input dồn lại, tới nơi được xử lý bù ngay.
 * - Cho "nợ" tối đa 20 (500 ms): client Colyseus gửi input đi trước ~RTT/2 + dư và gửi bù một loạt
 *   khi RTT tăng (Cloudflare, mobile) — phần đó được xử lý ngay.
 * Gửi đều nhanh hơn 40 Hz vẫn bị chặn ở mức nợ này — speedhack chỉ lợi một lần tối đa 500 ms.
 */
const MAX_BANKED_INPUT_STEPS = 40;
const MAX_INPUT_STEP_DEBT = 20;
/**
 * Input tồn quá mức này (client khựng lâu hơn phần để dành + nợ: app vào nền, đổi app, GC…, rồi gửi
 * bù cả loạt) thì không đuổi theo nữa: bỏ input cũ nhất, chỉ giữ lại phần client chủ động đi trước
 * (~RTT/2 + dư). Nếu không, phần thừa nằm lại vĩnh viễn và player trễ cố định (vd. 600 ms). Client bị
 * reconcile kéo về vị trí server một lần; input bị bỏ không được xử lý nên không lợi được tốc độ.
 */
const MAX_INPUT_BACKLOG = MAX_INPUT_STEP_DEBT;
const INPUT_BACKLOG_KEEP = 6;
const INPUT_BACKLOG_LOG_INTERVAL_MS = 5_000;

interface InputBudget {
    /** Số step còn được xử lý (âm = đang "nợ"). */
    credit: number;
    /** `room.clock.elapsedTime` lần cộng gần nhất. */
    refilledAt: number;
}

interface ButtonInput {
    targetNext: boolean;
    targetUnlock: boolean;
}

const RELEASED_BUTTONS: ButtonInput = { targetNext: false, targetUnlock: false };

export class PlayerWorldService {
    private readonly respawningPlayers = new WeakSet<PlayerWorldState>();
    private readonly previousButtons = new WeakMap<PlayerWorldState, ButtonInput>();
    private readonly inputBudgets = new WeakMap<PlayerWorldState, InputBudget>();
    private readonly lastBacklogLogAt = new WeakMap<PlayerWorldState, number>();
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
        const now = room.clock.elapsedTime;
        for (const [sessionId, state] of room.state.players) {
            const inputs = room.inputs.get(sessionId);
            const budget = this.refillInputBudget(state, now, ctx.dtMs);
            let steps = 0;
            while (steps < MAX_INPUT_STEPS_PER_TICK && budget.credit > -MAX_INPUT_STEP_DEBT) {
                const input = inputs.next();
                if (!input) break;
                this.step(room, sessionId, state, input, ctx.dt);
                budget.credit--;
                steps++;
            }
            this.trimInputBacklog(room, state, inputs, budget);

            // Không có input nhưng đã hết máu (bị monster đánh) → vẫn phải xử lý chết/hồi sinh.
            if (steps === 0 && state.hp <= 0) this.step(room, sessionId, state, undefined, ctx.dt);
        }
    }

    private refillInputBudget(state: PlayerWorldState, now: number, stepMs: number): InputBudget {
        let budget = this.inputBudgets.get(state);
        if (!budget) {
            budget = { credit: 0, refilledAt: now };
            this.inputBudgets.set(state, budget);
        }
        budget.credit = Math.min(
            budget.credit + (now - budget.refilledAt) / stepMs,
            MAX_BANKED_INPUT_STEPS
        );
        budget.refilledAt = now;
        return budget;
    }

    private trimInputBacklog(
        room: WorldRoom,
        state: PlayerWorldState,
        inputs: ReturnType<WorldRoom["inputs"]["get"]>,
        budget: InputBudget
    ): void {
        if (inputs.size <= MAX_INPUT_BACKLOG) return;
        let dropped = 0;
        while (inputs.size > INPUT_BACKLOG_KEEP && inputs.next()) dropped++;
        budget.credit = 0;

        const now = room.clock.elapsedTime;
        if (now - (this.lastBacklogLogAt.get(state) ?? -Infinity) < INPUT_BACKLOG_LOG_INTERVAL_MS) {
            return;
        }
        this.lastBacklogLogAt.set(state, now);
        console.info(
            `[WorldRoom] Player ${state.id}: dropped ${dropped} late inputs ` +
                `(~${Math.round((dropped * 1000) / room.tickRate)} ms) after a client stall`
        );
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
            player.setSpawns(room.map.spawnX, room.map.spawnY);
            this.respawningPlayers.delete(player);
        }, PLAYER_RESPAWN_MS);
    }
}

export const playerWorldService = new PlayerWorldService();

const normalizeAxis = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.max(-1, Math.min(1, Math.trunc(value)))
        : 0;
