import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { MoveCommand, applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import {
    getApproachDeadzone,
    getAutoTargetRange,
    getFaceTargetRange,
    getKeepTargetRange,
} from "@/rooms/world/utils/player-target.world.util.js";
import { skillDeliveryWorldService } from "@/rooms/world/services/skill-delivery.world.service.js";
import {
    PendingSkillHit,
    buildPendingSkillHits,
    getSkillCastTicks,
    getSkillDurationTicks,
    skillReachesTarget,
    tickPendingSkillHits,
    toHorizontalDirection,
} from "@/rooms/world/utils/skill-attack.world.util.js";
import {
    findPlayerAimTarget,
    playerSkillOwner,
} from "@/rooms/world/utils/skill-owner.world.util.js";

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
    /** PlayerMoveChain đặt khi step này đang tự đi lại gần target để đòn đánh chạm (chưa ra đòn). */
    approachingAttack?: boolean;
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

/**
 * Đòn đang trong thời gian chờ `castTimeMs` (anim + hit event chưa bắt đầu). Khớp WorldMovementStep.cs.
 * `attackCooldownTicks` đếm lùi từ tổng thời gian đòn, nên đã trôi `duration - attackCooldownTicks` tick.
 */
function isCasting(state: PlayerWorldState, tickRate: number) {
    if (state.attackCooldownTicks <= 0 || state.attackCombo <= 0) return false;
    const skill = skillService.getBasicAttackCombo(state.skills)[state.attackCombo - 1];
    if (!skill) return false;
    const elapsed = getSkillDurationTicks(skill, tickRate) - state.attackCooldownTicks;
    return elapsed < getSkillCastTicks(skill, tickRate);
}

export class PlayerDashChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ room, state, move, dashRequested }: PlayerChainContext): WorldChainResult {
        const canStartDash =
            dashRequested && state.dashCooldownTicks === 0 && state.dashTicks === 0;
        if (canStartDash) {
            // Dash huỷ đòn đánh đang dở, kể cả các hit chưa nổ. Đang cast (anim chưa chạy) thì cooldown
            // của skill chưa bắt đầu tính → huỷ luôn cooldown.
            const casting = isCasting(state, room.tickRate);
            state.attacking = false;
            state.cancelAttackLock();
            if (casting) state.skillCooldownTicks = 0;
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
            ? findTargetById(room, state, state.targetId, getKeepTargetRange())
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
            target = findTargetsInRange(room, state, getAutoRange(state))[0];
            state.targetId = target?.id ?? "";
        }

        // Khớp WorldMovementStep.cs: quay mặt về target hiện tại khi nó trong tầm quay mặt của class
        // (đánh xa: cung thủ quay về con đang ngắm).
        const faceRange = getFaceRange(state);
        if (
            target &&
            !state.dashing &&
            !dashRequested &&
            (state.moving || targetSwitchPressed || attackRequested) &&
            distanceSquared(state.x, state.y, target.x, target.y) <= faceRange ** 2
        ) {
            faceTarget(state, target.x - state.x);
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerMoveChain implements WorldChainAction<PlayerChainContext> {
    execute(context: PlayerChainContext): WorldChainResult {
        const { room, state, move, dt, attackRequested } = context;
        state.recoverPosition(room.map.spawnX, room.map.spawnY, room.map.width, room.map.height);
        if (!state.dashing && (attackRequested || state.attackCooldownTicks > 0)) {
            // Bấm đánh mà target (trong 2 ô) chưa nằm trong hitbox → tự đi lại gần, chưa ra đòn.
            const approach =
                attackRequested && state.attackCooldownTicks === 0
                    ? getAttackApproachMove(room, state)
                    : undefined;
            if (approach) {
                applyWorldMove(state, approach, room.moveBounds, dt, 1, 4);
                context.approachingAttack = true;
                return WorldChainResult.CONTINUE;
            }
            // Đứng yên khi đang đánh (cooldown còn) hoặc đang chờ ra đòn.
            state.moving = false;
            return WorldChainResult.CONTINUE;
        }
        applyWorldMove(state, move, room.moveBounds, dt, state.dashing ? 2 : 1, 4);
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerAttackChain implements WorldChainAction<PlayerChainContext> {
    private readonly pendingHits = new WeakMap<PlayerWorldState, PendingSkillHit[]>();

    interrupt(state: PlayerWorldState): void {
        this.pendingHits.delete(state);
        state.attackCombo = 0;
    }

    execute({
        room,
        sessionId,
        state,
        attackRequested,
        approachingAttack,
    }: PlayerChainContext): WorldChainResult {
        this.processPendingHits(room, sessionId, state);
        if (state.dashing || state.attackCooldownTicks > 0 || state.skillCooldownTicks > 0) {
            return WorldChainResult.CONTINUE;
        }

        // Hết đòn mà không có yêu cầu đánh tiếp ngay tick đầu tiên → mất combo.
        if (!attackRequested) {
            state.attackCombo = 0;
            return WorldChainResult.CONTINUE;
        }
        // Còn đang đi lại gần target → giữ yêu cầu, ra đòn khi đã vào tầm.
        if (approachingAttack) return WorldChainResult.CONTINUE;

        this.startAttack(room, state);
        return WorldChainResult.CONTINUE;
    }

    private startAttack(room: WorldRoom, state: PlayerWorldState): void {
        // Combo = các skill `basicAttack` player sở hữu, theo thứ tự cột `skills`; thời lượng mỗi đòn =
        // `castTimeMs` của skill đó (khớp WorldMovementStep.cs qua skills.json).
        const combo = skillService.getBasicAttackCombo(state.skills);
        state.attackCombo =
            state.attackCombo > 0 && state.attackCombo < combo.length ? state.attackCombo + 1 : 1;
        const skill = combo[state.attackCombo - 1];
        if (!skill) {
            state.attackCombo = 0;
            return;
        }

        const direction = toHorizontalDirection(state.direction);
        state.direction = direction;
        state.attackSerial++;
        this.pendingHits.set(
            state,
            buildPendingSkillHits(skill, state.attackSerial, direction, room.tickRate)
        );
        state.startAttack(
            getSkillDurationTicks(skill, room.tickRate),
            // Cooldown của skill chỉ bắt đầu tính khi cast xong (anim bắt đầu).
            skill.cooldownMs > 0
                ? getSkillCastTicks(skill, room.tickRate) +
                      millisecondsToTicks(skill.cooldownMs, room.tickRate)
                : 0
        );
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
        // HITBOX trúng ngay; đạn / vùng bay hoặc chờ nổ ở SkillDeliveryWorldService. Vị trí monster đọc
        // đúng chỗ client này đang vẽ (rewind) — cả lúc ngắm lẫn lúc trúng.
        skillDeliveryWorldService.deliver(room, {
            owner: playerSkillOwner(sessionId, state),
            skill: hit.skill,
            hit,
            originX: state.x,
            originY: state.y,
            aim: findPlayerAimTarget(room, sessionId, state),
        });
    }
}

/** Đòn kế tiếp trong combo đánh thường (cùng cách tăng combo như startAttack). */
function getNextBasicAttack(state: PlayerWorldState) {
    const combo = skillService.getBasicAttackCombo(state.skills);
    const step =
        state.attackCombo > 0 && state.attackCombo < combo.length ? state.attackCombo + 1 : 1;
    return combo[step - 1];
}

/**
 * Tầm chọn / quay mặt theo class (master data `player_target_config`) và `castRange` của skill sắp xài —
 * hiện chỉ có đánh thường nên skill sắp xài = đòn kế tiếp của combo.
 */
function getAutoRange(state: PlayerWorldState) {
    return getAutoTargetRange(state.classCode, getNextBasicAttack(state)?.castRange ?? 0);
}

function getFaceRange(state: PlayerWorldState) {
    return getFaceTargetRange(state.classCode, getNextBasicAttack(state)?.castRange ?? 0);
}

/**
 * Hướng đi khi tự áp sát: target hiện tại trong tầm quay mặt của class nhưng đòn kế tiếp chưa với tới nó
 * (`skillReachesTarget`, quay mặt về target). `undefined` = đánh tại chỗ (không có target / đã trong tầm).
 * Khớp WorldMovementStep.TryGetAttackApproach bên client.
 */
function getAttackApproachMove(room: WorldRoom, state: PlayerWorldState): MoveCommand | undefined {
    const target = state.targetId
        ? findTargetById(room, state, state.targetId, getFaceRange(state))
        : undefined;
    const skill = getNextBasicAttack(state);
    if (!target || !skill) return undefined;

    const dx = target.x - state.x;
    const dy = target.y - state.y;
    const direction = dx < 0 ? "left" : dx > 0 ? "right" : state.direction;
    if (skillReachesTarget(skill, { x: state.x, y: state.y, direction }, target)) return undefined;

    const deadzone = getApproachDeadzone();
    const moveX = Math.abs(dx) > deadzone ? Math.sign(dx) : 0;
    const moveY = Math.abs(dy) > deadzone ? Math.sign(dy) : 0;
    return moveX || moveY ? { moveX, moveY } : undefined;
}

function clearTarget(player: PlayerWorldState) {
    player.targetId = "";
    player.targetLocked = false;
}

/** Xoay vòng sang target kế tiếp (theo khoảng cách) trong tầm lock. */
function findNextTarget(room: WorldRoom, player: PlayerWorldState) {
    const targets = findTargetsInRange(room, player, getKeepTargetRange());
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
