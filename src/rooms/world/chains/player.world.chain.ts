import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { MoveCommand, applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import { intersectsSkillHitEvent } from "@/rooms/world/utils/skill-hitbox.world.util.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import {
    PendingSkillHit,
    buildPendingSkillHits,
    getSkillDurationTicks,
    tickPendingSkillHits,
    toHorizontalDirection,
} from "@/rooms/world/utils/skill-attack.world.util.js";

/** Không lock: mỗi step tự chọn monster gần nhất trong tầm này. */
const PLAYER_AUTO_TARGET_RANGE = 4;
/** Target đã lock bị mất khi ra xa quá tầm này (khớp KeepTargetRangeSquared bên client). */
const PLAYER_KEEP_TARGET_RANGE = 6;
/** Chỉ quay mặt về target khi nó ở gần. */
const PLAYER_FACE_TARGET_RANGE = 2;
/** Combo `swordman_slash_1..3`; thời lượng mỗi đòn = `castTimeMs` của skill (khớp anim client). */
const PLAYER_MAX_COMBO = 3;

export interface PlayerChainContext {
    room: WorldRoom;
    sessionId: string;
    state: PlayerWorldState;
    move: MoveCommand;
    /**
     * Client muốn đánh ở tick này. Client giữ cờ này từ lúc bấm (kể cả bấm trong lúc đang đánh)
     * đến khi đòn được bắt đầu, nên server chỉ cần đọc theo level — không giữ buffer ẩn,
     * nhờ vậy `WorldMovementStep.cs` predict khớp từng tick.
     */
    attackRequested: boolean;
    dashRequested: boolean;
    targetSwitchPressed: boolean;
    targetUnlockPressed: boolean;
    dt: number;
    scheduleRespawn: (player: PlayerWorldState) => void;
}

export class PlayerDeathChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ state, scheduleRespawn }: PlayerChainContext): WorldChainResult {
        if (state.hp > 0) return WorldChainResult.CONTINUE;
        state.setDead();
        this.attackChain.interrupt(state);
        scheduleRespawn(state);
        return WorldChainResult.STOP;
    }
}

export class PlayerHitInterruptChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ state }: PlayerChainContext): WorldChainResult {
        if (!state.hitInterrupted) return WorldChainResult.CONTINUE;

        state.hitInterrupted = false;
        this.attackChain.interrupt(state);
        return WorldChainResult.STOP;
    }
}

export class PlayerDashChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ room, state, move, dashRequested }: PlayerChainContext): WorldChainResult {
        const canStartDash =
            dashRequested && state.dashCooldownTicks === 0 && state.dashTicks === 0;
        if (canStartDash) {
            // Dash huỷ đòn đánh đang dở, kể cả các hit chưa nổ.
            state.attacking = false;
            state.attackCooldownTicks = 0;
            this.attackChain.interrupt(state);
        }

        state.chainDash(dashRequested, room.tickRate);
        if (state.dashing && move.moveX === 0 && move.moveY === 0) {
            move.moveX = state.direction === "left" ? -1 : 1;
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerTargetChain implements WorldChainAction<PlayerChainContext> {
    execute({
        room,
        state,
        targetSwitchPressed,
        targetUnlockPressed,
        dashRequested,
        attackRequested,
    }: PlayerChainContext): WorldChainResult {
        if (targetUnlockPressed) clearTarget(state);

        // Lock: giữ target tới khi ra khỏi tầm giữ. Không lock: mỗi step chọn lại con gần nhất.
        let target = state.targetLocked
            ? findTargetById(room, state, state.targetId, PLAYER_KEEP_TARGET_RANGE)
            : undefined;
        if (state.targetLocked && !target) clearTarget(state);

        if (targetSwitchPressed) {
            target = findNextTarget(room, state);
            if (target) {
                state.targetId = target.id;
                state.targetLocked = true;
            } else {
                clearTarget(state);
            }
        } else if (!state.targetLocked) {
            target = findTargetsInRange(room, state, PLAYER_AUTO_TARGET_RANGE)[0];
            state.targetId = target?.id ?? "";
        }

        // Khớp WorldMovementStep.cs: quay mặt về target hiện tại khi nó trong tầm 2 ô.
        if (
            target &&
            !state.dashing &&
            !dashRequested &&
            (state.moving || targetSwitchPressed || attackRequested) &&
            distanceSquared(state.x, state.y, target.x, target.y) <= PLAYER_FACE_TARGET_RANGE ** 2
        ) {
            faceTarget(state, target.x - state.x);
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerMoveChain implements WorldChainAction<PlayerChainContext> {
    execute({ room, state, move, dt, attackRequested }: PlayerChainContext): WorldChainResult {
        state.recoverPosition(room.map.spawnX, room.map.spawnY, room.map.width, room.map.height);
        // Đứng yên khi đang đánh (cooldown còn) hoặc đang chờ ra đòn.
        if (!state.dashing && (attackRequested || state.attackCooldownTicks > 0)) {
            state.moving = false;
            return WorldChainResult.CONTINUE;
        }
        applyWorldMove(state, move, room.map, dt, state.dashing ? 2 : 1, 4);
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerAttackChain implements WorldChainAction<PlayerChainContext> {
    private readonly pendingHits = new WeakMap<PlayerWorldState, PendingSkillHit[]>();

    interrupt(state: PlayerWorldState): void {
        this.pendingHits.delete(state);
        state.attackCombo = 0;
    }

    execute({ room, sessionId, state, attackRequested }: PlayerChainContext): WorldChainResult {
        this.processPendingHits(room, sessionId, state);
        if (state.dashing || state.attackCooldownTicks > 0) return WorldChainResult.CONTINUE;

        // Hết đòn mà không có yêu cầu đánh tiếp ngay tick đầu tiên → mất combo.
        if (!attackRequested) {
            state.attackCombo = 0;
            return WorldChainResult.CONTINUE;
        }

        this.startAttack(room, state);
        return WorldChainResult.CONTINUE;
    }

    private startAttack(room: WorldRoom, state: PlayerWorldState): void {
        state.attackCombo =
            state.attackCombo > 0 && state.attackCombo < PLAYER_MAX_COMBO
                ? state.attackCombo + 1
                : 1;
        const skill = skillService.getByCode(`swordman_slash_${state.attackCombo}`);
        if (!skill) {
            state.attackCombo = 0;
            return;
        }

        const direction = toHorizontalDirection(state.direction);
        state.direction = direction;
        this.pendingHits.set(
            state,
            buildPendingSkillHits(skill, state.attack, direction, room.tickRate)
        );
        state.startAttack(getSkillDurationTicks(skill, room.tickRate));
    }

    private processPendingHits(room: WorldRoom, sessionId: string, state: PlayerWorldState): void {
        const hits = this.pendingHits.get(state);
        if (!hits) return;

        tickPendingSkillHits(hits, (hit) => this.applyHit(room, sessionId, state, hit));
        if (hits.length === 0) this.pendingHits.delete(state);
    }

    private applyHit(
        room: WorldRoom,
        sessionId: string,
        state: PlayerWorldState,
        hit: PendingSkillHit
    ): void {
        // Player tự predict nên vị trí của chính nó là live; monster thì đọc lại đúng chỗ client đang vẽ.
        const seen = room.rewind.lastSeenBy(sessionId);
        const origin = { x: state.x, y: state.y, direction: hit.direction };
        for (const target of room.state.monsters.values()) {
            if (target.hp <= 0) continue;
            const targetX = seen.value(target, "x");
            const targetY = seen.value(target, "y");
            if (!intersectsSkillHitEvent(origin, targetX, targetY, target.hitbox, hit.event)) {
                continue;
            }

            target.setAggroTarget(state.id);
            target.takeDamage(
                Math.max(1, hit.rawDamage - target.defense),
                millisecondsToTicks(target.attackCooldownMs, room.tickRate)
            );
        }
    }
}

function clearTarget(player: PlayerWorldState) {
    player.targetId = "";
    player.targetLocked = false;
}

/** Xoay vòng sang target kế tiếp (theo khoảng cách) trong tầm lock. */
function findNextTarget(room: WorldRoom, player: PlayerWorldState) {
    const targets = findTargetsInRange(room, player, PLAYER_KEEP_TARGET_RANGE);
    if (targets.length === 0) return undefined;
    const currentIndex = targets.findIndex((candidate) => candidate.id === player.targetId);
    return targets[(currentIndex + 1) % targets.length];
}

function findTargetById(
    room: WorldRoom,
    player: PlayerWorldState,
    targetId: string,
    range: number
) {
    return findTargetsInRange(room, player, range).find((monster) => monster.id === targetId);
}

function findTargetsInRange(room: WorldRoom, player: PlayerWorldState, range: number) {
    const distanceTo = (monster: { x: number; y: number }) =>
        distanceSquared(player.x, player.y, monster.x, monster.y);
    return (
        [...room.state.monsters.values()]
            .filter((monster) => monster.hp > 0 && distanceTo(monster) <= range ** 2)
            // So id theo ordinal để khớp `string.CompareOrdinal` bên client.
            .sort(
                (a, b) => distanceTo(a) - distanceTo(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
            )
    );
}

function faceTarget(player: PlayerWorldState, dx: number) {
    if (dx < 0) player.direction = "left";
    else if (dx > 0) player.direction = "right";
}
