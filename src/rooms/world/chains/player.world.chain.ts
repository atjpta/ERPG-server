import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import {
    MoveCommand,
    DIAGONAL_FACTOR,
    applyDirectedMove,
    applyWorldMove,
} from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import {
    getChargeConfig,
    isChargeSkill,
    skillService,
} from "@/modules/skills/services/skill.service.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
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
    /** Skill chủ động dùng ở tick này (số thứ tự từ 1, 0 = không) — chỉ có hiệu lực đúng tick đó, không giữ buffer. */
    skillRequested: number;
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

/** Skill của đòn đang vung: skill chủ động (`castSlot`) hoặc bước `attackCombo` của combo đánh thường. */
function getCurrentAttackSkill(state: PlayerWorldState) {
    if (state.castSlot > 0) return skillService.getActiveSkills(state.skills)[state.castSlot - 1];
    if (state.attackCombo > 0)
        return skillService.getBasicAttackCombo(state.skills)[state.attackCombo - 1];
    return undefined;
}

/**
 * Đòn đang trong thời gian chờ `castTimeMs` (anim + hit event chưa bắt đầu). Khớp WorldMovementStep.cs.
 * `attackCooldownTicks` đếm lùi từ tổng thời gian đòn, nên đã trôi `duration - attackCooldownTicks` tick.
 */
function isCasting(state: PlayerWorldState, tickRate: number) {
    if (state.attackCooldownTicks <= 0) return false;
    const skill = getCurrentAttackSkill(state);
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
            if (casting) {
                state.skillCooldownTicks = 0;
                state.setSkillCooldownTicks(state.castSlot, 0);
            }
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
        skillRequested,
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
            (state.moving || targetSwitchPressed || attackRequested || skillRequested > 0) &&
            distanceSquared(state.x, state.y, target.x, target.y) <= faceRange ** 2
        ) {
            faceTarget(state, target.x - state.x);
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerMoveChain implements WorldChainAction<PlayerChainContext> {
    execute(context: PlayerChainContext): WorldChainResult {
        const { room, state, move, dt, attackRequested, skillRequested } = context;
        state.recoverPosition(room.map.spawnX, room.map.spawnY, room.map.width, room.map.height);
        if (
            !state.dashing &&
            (attackRequested || skillRequested > 0 || state.attackCooldownTicks > 0)
        ) {
            // Bấm đánh mà target (trong 2 ô) chưa nằm trong hitbox → tự đi lại gần, chưa ra đòn.
            // Skill chủ động thì dùng tại chỗ, không tự áp sát.
            const approach =
                attackRequested && skillRequested === 0 && state.attackCooldownTicks === 0
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
        state.castSlot = 0;
        state.clearCharge();
    }

    execute({
        room,
        sessionId,
        state,
        move,
        attackRequested,
        skillRequested,
        approachingAttack,
        dt,
    }: PlayerChainContext): WorldChainResult {
        this.processPendingHits(room, sessionId, state);
        // Đang lướt tới mục tiêu của skill lướt: chưa ra đòn, mọi đòn khác bị khoá (attackCooldownTicks đang đếm lùi).
        if (state.charging) {
            this.stepCharge(room, state, move, dt);
            return WorldChainResult.CONTINUE;
        }
        // Đang vung (animationMs) hoặc lướt: khoá mọi skill và đòn đánh thường.
        if (state.dashing || state.attackCooldownTicks > 0) return WorldChainResult.CONTINUE;

        // Skill chủ động được ưu tiên hơn đòn đánh thường và chỉ cần hết lúc vung (hồi đòn đánh thường
        // không chặn nó); thiếu mana / chưa hết hồi của chính skill đó thì bỏ qua yêu cầu.
        if (skillRequested > 0 && this.startSkill(room, state, skillRequested)) {
            return WorldChainResult.CONTINUE;
        }
        state.castSlot = 0;

        // Hồi đòn đánh thường (`cooldownMs`) chỉ chặn đòn đánh thường.
        if (state.skillCooldownTicks > 0) return WorldChainResult.CONTINUE;

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

    /**
     * Dùng skill chủ động số `slot` (khớp WorldMovementStep.cs): cần còn hồi xong, đủ mana. Lên lịch hit như
     * đòn đánh thường; hồi chiêu của skill đếm từ lúc bắt đầu (sau `castTimeMs`, như cooldown đòn đánh thường).
     */
    private startSkill(room: WorldRoom, state: PlayerWorldState, slot: number): boolean {
        const skill = skillService.getActiveSkills(state.skills)[slot - 1];
        if (!skill) return false;
        if (state.getSkillCooldownTicks(slot) > 0) return false;
        if (state.mp < skill.manaCost) return false;

        const cooldownTicks =
            skill.cooldownMs > 0
                ? getSkillCastTicks(skill, room.tickRate) +
                  millisecondsToTicks(skill.cooldownMs, room.tickRate)
                : 0;
        if (isChargeSkill(skill)) {
            // Skill lướt: có mục tiêu đang chọn trong `castRange` thì lướt tới nó; không có thì lướt thẳng theo hướng đang
            // quay, dài bằng dash thường, rồi ra đòn ở cuối. Chưa ra đòn lúc bấm, chỉ bắt đầu lướt.
            const target = findTargetById(room, state, state.targetId, skill.castRange);
            state.mp -= skill.manaCost;
            if (target) faceTarget(state, target.x - state.x);
            state.startCharge(
                slot,
                target?.id ?? "",
                target
                    ? getChargeTicks(skill, room.tickRate)
                    : getFreeChargeTicks(skill, room.tickRate),
                cooldownTicks
            );
            return true;
        }

        state.mp -= skill.manaCost;
        const direction = toHorizontalDirection(state.direction);
        state.direction = direction;
        state.attackSerial++;
        this.pendingHits.set(
            state,
            buildPendingSkillHits(skill, state.attackSerial, direction, room.tickRate)
        );
        state.startSkill(slot, getSkillDurationTicks(skill, room.tickRate), cooldownTicks);
        return true;
    }

    /**
     * Một step lướt tới mục tiêu (khớp WorldMovementStep.cs): mỗi step dời về phía phần gần nhất của collider mục tiêu
     * tối đa `tốc độ lướt × dt`, không vượt quãng còn lại; hai collider chạm nhau thì bắt đầu đòn (hit event tính từ đó).
     * Hết thời gian lướt, mục tiêu chết hoặc biến mất thì dừng, không ra đòn.
     */
    private stepCharge(
        room: WorldRoom,
        state: PlayerWorldState,
        move: MoveCommand,
        dt: number
    ): void {
        const skill = skillService.getActiveSkills(state.skills)[state.castSlot - 1];
        if (!skill) {
            state.cancelCharge();
            return;
        }

        if (state.chargeTargetId) {
            const target = findAliveMonster(room, state.chargeTargetId);
            if (!target || state.attackCooldownTicks <= 1) {
                state.cancelCharge();
                return;
            }
            let gap = getColliderGap(state, target);
            if (gap.distance > CHARGE_CONTACT_EPSILON) {
                faceTarget(state, target.x - state.x);
                const move = Math.min(getChargeSpeed(skill) * dt, gap.distance);
                applyDirectedMove(
                    state,
                    gap.directionX * move,
                    gap.directionY * move,
                    room.moveBounds,
                    state.collider
                );
                state.moving = true;
                gap = getColliderGap(state, target);
            }
            if (gap.distance > CHARGE_CONTACT_EPSILON) return;
        } else if (state.attackCooldownTicks > 1) {
            // Không có mục tiêu: lướt theo hướng đang đi (8 hướng như dash thường; không giữ cần thì theo hướng đang quay)
            // đủ `freeDistance`, hết đoạn lướt thì ra đòn.
            let moveX = move.moveX;
            const moveY = move.moveY;
            if (moveX === 0 && moveY === 0) moveX = state.direction === "left" ? -1 : 1;
            const step =
                getChargeSpeed(skill) * dt * (moveX !== 0 && moveY !== 0 ? DIAGONAL_FACTOR : 1);
            applyDirectedMove(state, moveX * step, moveY * step, room.moveBounds, state.collider);
            if (moveX < 0) state.direction = "left";
            else if (moveX > 0) state.direction = "right";
            state.moving = true;
            return;
        }

        const direction = toHorizontalDirection(state.direction);
        state.direction = direction;
        state.moving = false;
        state.attackSerial++;
        this.pendingHits.set(
            state,
            buildPendingSkillHits(skill, state.attackSerial, direction, room.tickRate)
        );
        state.beginChargeStrike(getSkillDurationTicks(skill, room.tickRate));
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

/** Hai collider coi là chạm khi khoảng cách giữa chúng không quá ngưỡng này (tile). Client C# dùng cùng giá trị. */
const CHARGE_CONTACT_EPSILON = 1e-4;

/** Tốc độ, thời gian dư, quãng lướt không mục tiêu của skill lướt: cột `chargeConfig` (skill seed), thiếu thì mặc định. */
const getChargeSpeed = (skill: Skill) => getChargeConfig(skill).speed;

/**
 * Thời gian (tick) của lướt không có mục tiêu: đủ đi `freeDistance` ô ở tốc độ lướt, cộng 2 để
 * `attackCooldownTicks` còn đúng 1 ở tick ra đòn. Client C# (WorldMovementStep.FreeChargeTicks) tính y hệt.
 */
const getFreeChargeTicks = (skill: Skill, tickRate: number) => {
    const { speed, freeDistance } = getChargeConfig(skill);
    return Math.min(0xff, Math.ceil((freeDistance / speed) * tickRate) + 2);
};

/** Thời gian lướt tối đa (tick): đủ đi hết `castRange` cộng `graceTicks`. Tối đa 255 (uint8 của attackCooldownTicks). */
const getChargeTicks = (skill: Skill, tickRate: number) => {
    const { speed, graceTicks } = getChargeConfig(skill);
    return Math.min(0xff, Math.ceil((skill.castRange / speed) * tickRate) + graceTicks);
};

interface BodyCollider {
    x: number;
    y: number;
    collider?: HitboxColliderState;
}

/**
 * Khoảng cách giữa collider của hai bên (hình chữ nhật song song trục; tâm = (x + offsetX, y - offsetY), y world hướng xuống)
 * và hướng đi (vector đơn vị) từ bên thứ nhất về phía điểm gần nhất của bên thứ hai. 0 = đã chạm / lấn nhau.
 */
function getColliderGap(from: BodyCollider, to: BodyCollider) {
    const fromCenterX = from.x + (from.collider?.offsetX ?? 0);
    const fromCenterY = from.y - (from.collider?.offsetY ?? 0);
    const toCenterX = to.x + (to.collider?.offsetX ?? 0);
    const toCenterY = to.y - (to.collider?.offsetY ?? 0);
    const deltaX = toCenterX - fromCenterX;
    const deltaY = toCenterY - fromCenterY;
    const halfWidth = ((from.collider?.width ?? 0) + (to.collider?.width ?? 0)) / 2;
    const halfHeight = ((from.collider?.height ?? 0) + (to.collider?.height ?? 0)) / 2;
    const gapX = Math.max(0, Math.abs(deltaX) - halfWidth);
    const gapY = Math.max(0, Math.abs(deltaY) - halfHeight);
    const distance = Math.sqrt(gapX * gapX + gapY * gapY);
    return {
        distance,
        directionX: distance > 0 ? (Math.sign(deltaX) * gapX) / distance : 0,
        directionY: distance > 0 ? (Math.sign(deltaY) * gapY) / distance : 0,
    };
}

function findAliveMonster(room: WorldRoom, id: string) {
    if (!id) return undefined;
    for (const monster of room.state.monsters) {
        if (monster.id === id && monster.hp > 0) return monster;
    }
    return undefined;
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
