import { distanceSquared } from "@/rooms/world/core/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import {
    MoveCommand,
    DIAGONAL_FACTOR,
    applyDirectedMove,
    applyWorldMove,
} from "@/rooms/world/players/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/core/chains/world.chain.js";
import {
    getChargeConfig,
    isChargeSkill,
    skillService,
} from "@/modules/skills/services/skill.service.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { millisecondsToTicks } from "@/rooms/world/core/utils/tick.world.util.js";
import {
    getApproachDeadzone,
    getAutoTargetRange,
    getFaceTargetRange,
    getKeepTargetRange,
} from "@/rooms/world/players/utils/player-target.world.util.js";
import { skillDeliveryWorldService } from "@/rooms/world/combat/services/skill-delivery.world.service.js";
import {
    PendingSkillHit,
    buildPendingSkillHits,
    getAuraEvent,
    getSkillCastTicks,
    getSkillCooldownTicks,
    getSkillDurationTicks,
    skillReachesTarget,
    tickPendingSkillHits,
    toHorizontalDirection,
} from "@/rooms/world/combat/utils/skill-attack.world.util.js";
import {
    findPlayerAimTarget,
    playerSkillOwner,
} from "@/rooms/world/combat/utils/skill-owner.world.util.js";

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
    /** PlayerMoveChain đặt khi step này đang tự đi lại gần target cho đủ tầm dùng skill chủ động (chưa dùng skill). */
    approachingSkill?: boolean;
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

/** Level của skill đang sở hữu (từ 1); chưa có thì 1. */
function getOwnedSkillLevel(state: PlayerWorldState, skill: { id: string }): number {
    for (const owned of state.skills) {
        if (owned.skillId === skill.id) return Math.max(1, owned.level);
    }
    return 1;
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
            // Bấm skill chủ động mà target xa hơn tầm của skill → tự đi lại gần cho đủ tầm, rồi mới dùng skill.
            const skillApproach =
                skillRequested > 0 && state.attackCooldownTicks === 0
                    ? getSkillApproachMove(room, state, skillRequested)
                    : undefined;
            // Bấm đánh mà target (trong 2 ô) chưa nằm trong hitbox → tự đi lại gần, chưa ra đòn.
            const approach =
                skillApproach ??
                (attackRequested && skillRequested === 0 && state.attackCooldownTicks === 0
                    ? getAttackApproachMove(room, state)
                    : undefined);
            if (approach) {
                applyWorldMove(state, approach, room.moveBounds, dt, 1, 4);
                if (skillApproach) context.approachingSkill = true;
                else context.approachingAttack = true;
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
        approachingSkill,
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
        if (skillRequested > 0) {
            // Còn đang đi lại gần target cho đủ tầm → giữ yêu cầu, dùng skill khi đã vào tầm.
            if (approachingSkill) return WorldChainResult.CONTINUE;
            if (this.startSkill(room, sessionId, state, skillRequested)) {
                return WorldChainResult.CONTINUE;
            }
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
    private startSkill(
        room: WorldRoom,
        sessionId: string,
        state: PlayerWorldState,
        slot: number
    ): boolean {
        const skill = skillService.getActiveSkills(state.skills)[slot - 1];
        if (!skill) return false;
        if (state.getSkillCooldownTicks(slot) > 0) return false;
        if (state.mp < skill.manaCost) return false;
        // Đang chọn target thì phải đủ tầm mới dùng được skill (skill tự thân, castRange 0, không cần).
        if (isTargetOutOfRange(room, state, skill)) return false;

        // Hồi chiêu đếm từ lúc bấm; skill AURA thì chỉ tính sau khi buff hết (cộng sẵn thời gian buff ở level này).
        const level = getOwnedSkillLevel(state, skill);
        const cooldownTicks = getSkillCooldownTicks(skill, level, room.tickRate);
        if (isChargeSkill(skill)) {
            // Skill lướt luôn lướt đủ quãng (`freeDistance`, mặc định cả `castRange`) rồi mới ra đòn ở cuối, không dừng khi chạm
            // quái (xuyên qua). Có mục tiêu đang chọn trong `castRange` thì lướt thẳng về phía nó (hướng chốt vào aimX/aimY);
            // không có thì lướt theo hướng đang đi. Chưa ra đòn lúc bấm, chỉ bắt đầu lướt.
            const target = findTargetById(room, state, state.targetId, skill.castRange);
            state.mp -= skill.manaCost;
            if (target) {
                faceTarget(state, target.x - state.x);
                const dx = target.x - state.x;
                const dy = target.y - state.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > AIM_EPSILON) {
                    state.aimX = dx / length;
                    state.aimY = dy / length;
                } else {
                    state.aimX = state.direction === "left" ? -1 : 1;
                    state.aimY = 0;
                }
            }
            // Có mục tiêu: chỉ lướt tới ngay sau lưng nó (tâm mục tiêu + nửa collider hai bên theo hướng lướt), không quá `freeDistance`.
            const distance = target
                ? Math.min(
                      Math.hypot(target.x - state.x, target.y - state.y) +
                          getHalfExtent(target.collider, state.aimX, state.aimY) +
                          getHalfExtent(state.collider, state.aimX, state.aimY),
                      getChargeDistance(skill)
                  )
                : getChargeDistance(skill);
            state.startCharge(
                slot,
                target?.id ?? "",
                getFreeChargeTicks(skill, room.tickRate, distance),
                cooldownTicks
            );
            return true;
        }

        state.mp -= skill.manaCost;
        const aim = this.resolveAim(room, sessionId, state, skill);
        const direction = toHorizontalDirection(state.direction);
        state.direction = direction;
        state.attackSerial++;
        this.pendingHits.set(
            state,
            buildPendingSkillHits(skill, state.attackSerial, direction, room.tickRate, 1, aim)
        );
        state.startSkill(slot, getSkillDurationTicks(skill, room.tickRate), cooldownTicks);
        // Skill AURA: vùng buff bắt đầu ngay, bám theo người dùng (hit event AURA không nằm trong lịch hit).
        if (getAuraEvent(skill)) {
            skillDeliveryWorldService.startAura(room, {
                sessionId,
                player: state,
                skill,
                slot,
                level,
            });
        }
        return true;
    }

    /**
     * Hướng ngắm của skill (khớp WorldMovementStep.SetAim): skill có hit `aimed` ngắm về giữa hitbox target đang chọn (hướng mặt
     * quay theo luôn), không có target thì theo hướng mặt; skill khác chỉ theo hướng mặt. Ghi vào `aimX/aimY` cho client.
     * Trả về hướng ngắm nếu skill có hit `aimed`.
     */
    private resolveAim(
        room: WorldRoom,
        sessionId: string,
        state: PlayerWorldState,
        skill: { skillHitEvents: { aimed?: boolean }[] }
    ): { x: number; y: number } | undefined {
        const facing = toHorizontalDirection(state.direction) === "left" ? -1 : 1;
        let aimX = facing;
        let aimY = 0;
        const aimed = skill.skillHitEvents.some((event) => event.aimed);
        const target = aimed ? findPlayerAimTarget(room, sessionId, state) : undefined;
        if (target) {
            const dx = target.x + target.hitbox.offsetX - state.x;
            const dy = target.y - target.hitbox.offsetY - state.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > AIM_EPSILON) {
                aimX = dx / length;
                aimY = dy / length;
                if (aimX < 0) state.direction = "left";
                else if (aimX > 0) state.direction = "right";
            }
        }
        state.aimX = aimX;
        state.aimY = aimY;
        return aimed ? { x: aimX, y: aimY } : undefined;
    }

    /**
     * Một step lướt (khớp WorldMovementStep.cs): dời `tốc độ lướt × dt` theo hướng chốt (về phía mục tiêu lúc bấm, hoặc hướng
     * đang đi), xuyên qua quái. Hết đoạn lướt thì bắt đầu đòn (hit event tính từ đó), quay mặt lại mục tiêu nếu còn sống.
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

        if (state.attackCooldownTicks > 1) {
            if (state.chargeTargetId) {
                // Có mục tiêu: lướt thẳng theo hướng chốt lúc bấm (xuyên qua quái, collider quái không cản).
                const dirX = state.aimX;
                const dirY = state.aimY;
                const step = getChargeSpeed(skill) * dt;
                applyDirectedMove(state, dirX * step, dirY * step, room.moveBounds, state.collider);
                if (dirX < 0) state.direction = "left";
                else if (dirX > 0) state.direction = "right";
            } else {
                // Không có mục tiêu: lướt theo hướng đang đi (8 hướng như dash thường; không giữ cần thì theo hướng đang quay).
                let moveX = move.moveX;
                const moveY = move.moveY;
                if (moveX === 0 && moveY === 0) moveX = state.direction === "left" ? -1 : 1;
                const step =
                    getChargeSpeed(skill) * dt * (moveX !== 0 && moveY !== 0 ? DIAGONAL_FACTOR : 1);
                applyDirectedMove(
                    state,
                    moveX * step,
                    moveY * step,
                    room.moveBounds,
                    state.collider
                );
                if (moveX < 0) state.direction = "left";
                else if (moveX > 0) state.direction = "right";
            }
            state.moving = true;
            return;
        }
        // Hết đoạn lướt: quay lại nhìn mục tiêu (nếu còn sống) để đòn thứ hai trúng nó dù đã lướt xuyên qua.
        if (state.chargeTargetId) {
            const target = findAliveMonster(room, state.chargeTargetId);
            if (target) faceTarget(state, target.x - state.x);
        }

        const direction = toHorizontalDirection(state.direction);
        state.direction = direction;
        // Đòn sau khi lướt không ngắm: hiệu ứng của nó quay theo hướng mặt.
        state.aimX = direction === "left" ? -1 : 1;
        state.aimY = 0;
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

/** Khoảng cách tới target nhỏ hơn ngưỡng này thì coi như không có hướng (ngắm theo hướng mặt). Client C# dùng cùng giá trị. */
const AIM_EPSILON = 1e-6;

/** Tốc độ, thời gian dư, quãng lướt không mục tiêu của skill lướt: cột `chargeConfig` (skill seed), thiếu thì mặc định. */
const getChargeSpeed = (skill: Skill) => getChargeConfig(skill).speed;

/**
 * Thời gian (tick) của lướt: đủ đi `distance` ô ở tốc độ lướt, cộng 2 để
 * `attackCooldownTicks` còn đúng 1 ở tick ra đòn. Client C# (WorldMovementStep.FreeChargeTicks) tính y hệt.
 */
const getFreeChargeTicks = (skill: Skill, tickRate: number, distance: number) =>
    Math.min(0xff, Math.ceil((distance / getChargeConfig(skill).speed) * tickRate) + 2);

/** Quãng lướt tối đa: `freeDistance`, mặc định cả `castRange`. */
const getChargeDistance = (skill: Skill) => getChargeConfig(skill).freeDistance ?? skill.castRange;

/** Nửa kích thước collider (hình chữ nhật song song trục) chiếu lên hướng (dirX, dirY). */
const getHalfExtent = (collider: HitboxColliderState | undefined, dirX: number, dirY: number) =>
    ((collider?.width ?? 0) * Math.abs(dirX) + (collider?.height ?? 0) * Math.abs(dirY)) / 2;

function findAliveMonster(room: WorldRoom, id: string) {
    if (!id) return undefined;
    for (const monster of room.state.monsters) {
        if (monster.id === id && monster.hp > 0) return monster;
    }
    return undefined;
}

/**
 * Player đang chọn một monster còn sống mà nó xa hơn `castRange` của skill (khoảng cách tâm tới tâm, như `findTargetById`).
 * Không chọn target, hoặc skill không có tầm (castRange 0) thì không bị chặn. Khớp WorldMovementStep.IsTargetOutOfRange bên client.
 */
function isTargetOutOfRange(
    room: WorldRoom,
    state: PlayerWorldState,
    skill: { castRange: number }
) {
    if (skill.castRange <= 0 || !state.targetId) return false;
    const target = findAliveMonster(room, state.targetId);
    return !!target && distanceSquared(state.x, state.y, target.x, target.y) > skill.castRange ** 2;
}

/**
 * Hướng đi khi tự áp sát để dùng skill chủ động `slot`: skill dùng được (hết hồi, đủ mana) mà target đang chọn xa hơn `castRange`
 * → đi về phía target (cùng deadzone và 8 hướng như áp sát đòn đánh thường). `undefined` = dùng tại chỗ (đã đủ tầm, không có
 * target, hoặc skill chưa dùng được). Khớp WorldMovementStep.TryGetSkillApproach bên client.
 */
function getSkillApproachMove(
    room: WorldRoom,
    state: PlayerWorldState,
    slot: number
): MoveCommand | undefined {
    const skill = skillService.getActiveSkills(state.skills)[slot - 1];
    if (!skill || state.getSkillCooldownTicks(slot) > 0 || state.mp < skill.manaCost)
        return undefined;
    if (!isTargetOutOfRange(room, state, skill)) return undefined;
    const target = findAliveMonster(room, state.targetId);
    if (!target) return undefined;

    const dx = target.x - state.x;
    const dy = target.y - state.y;
    const deadzone = getApproachDeadzone();
    const moveX = Math.abs(dx) > deadzone ? Math.sign(dx) : 0;
    const moveY = Math.abs(dy) > deadzone ? Math.sign(dy) : 0;
    return moveX || moveY ? { moveX, moveY } : undefined;
}

function clearTarget(player: PlayerWorldState) {
    player.clearTarget();
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
