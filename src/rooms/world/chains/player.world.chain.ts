import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { MoveCommand, applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import { intersectsSkillHitEvent } from "@/rooms/world/utils/skill-hitbox.world.util.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import { DamageScalingType, SkillEffectType } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { millisecondsToTicks, skillEventTicks } from "@/rooms/world/utils/tick.world.util.js";

const PLAYER_AUTO_TARGET_RANGE = 4;
const PLAYER_AUTO_FACE_RANGE = PLAYER_AUTO_TARGET_RANGE / 2;
const PLAYER_ATTACK_DURATION_MS = [400, 750, 400];

interface PendingSkillHit {
    ticksUntilHit: number;
    event: SkillHitEvent;
    rawDamage: number;
    direction: "left" | "right";
}

export interface PlayerChainContext {
    room: WorldRoom;
    state: PlayerWorldState;
    move: MoveCommand;
    attackRequested: boolean;
    attackPressed: boolean;
    dashRequested: boolean;
    targetSwitchRequested: boolean;
    targetUnlockRequested: boolean;
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
            state.attacking = false;
            state.attackCooldownTicks = 0;
            this.attackChain.cancelForDash(state);
        }

        state.chainDash(dashRequested, room.tickRate);
        if (state.dashing && move.moveX === 0 && move.moveY === 0) {
            if (state.direction === "left") move.moveX = -1;
            else if (state.direction === "right") move.moveX = 1;
            else if (state.direction === "up") move.moveY = -1;
            else move.moveY = 1;
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerTargetChain implements WorldChainAction<PlayerChainContext> {
    private readonly previousSwitchInput = new WeakMap<PlayerWorldState, boolean>();
    private readonly previousUnlockInput = new WeakMap<PlayerWorldState, boolean>();

    execute({
        room,
        state,
        targetSwitchRequested,
        targetUnlockRequested,
        dashRequested,
        attackRequested,
    }: PlayerChainContext): WorldChainResult {
        const wasSwitchRequested = this.previousSwitchInput.get(state) ?? false;
        const wasUnlockRequested = this.previousUnlockInput.get(state) ?? false;
        this.previousSwitchInput.set(state, targetSwitchRequested);
        this.previousUnlockInput.set(state, targetUnlockRequested);
        const switchPressed = targetSwitchRequested && !wasSwitchRequested;
        const unlockPressed = targetUnlockRequested && !wasUnlockRequested;

        if (unlockPressed) {
            state.targetId = "";
            state.targetLocked = false;
        }

        let target = state.targetLocked
            ? findTargetById(room, state, state.targetId, PLAYER_AUTO_TARGET_RANGE * 2)
            : undefined;
        if (state.targetLocked && !target) {
            state.targetId = "";
            state.targetLocked = false;
        }

        if (switchPressed) {
            const targets = findTargetsInRange(room, state, PLAYER_AUTO_TARGET_RANGE * 2);
            if (targets.length > 0) {
                const currentIndex = targets.findIndex(
                    (candidate) => candidate.id === state.targetId
                );
                target = targets[(currentIndex + 1) % targets.length];
                state.targetId = target.id;
                state.targetLocked = true;
            } else {
                target = undefined;
                state.targetId = "";
                state.targetLocked = false;
            }
        } else if (!state.targetLocked) {
            target = findAutoTarget(room, state);
            state.targetId = target?.id ?? "";
        }

        if (!target && state.targetLocked) {
            target = findTargetById(room, state, state.targetId, PLAYER_AUTO_TARGET_RANGE * 2);
        }
        if (
            target &&
            !state.dashing &&
            !dashRequested &&
            (state.moving || switchPressed || attackRequested) &&
            distanceSquared(state.x, state.y, target.x, target.y) <= PLAYER_AUTO_FACE_RANGE ** 2
        ) {
            faceTarget(state, target.x - state.x);
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerMoveChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ room, state, move, dt, attackPressed }: PlayerChainContext): WorldChainResult {
        state.recoverPosition(room.map.spawnX, room.map.spawnY, room.map.width, room.map.height);
        if (
            !state.dashing &&
            (attackPressed ||
                state.attacking ||
                state.attackCooldownTicks > 0 ||
                this.attackChain.hasBufferedAttack(state))
        ) {
            state.moving = false;
            return WorldChainResult.CONTINUE;
        }
        applyWorldMove(state, move, room.map, dt, state.dashing ? 2 : 1, 4);
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerAttackChain implements WorldChainAction<PlayerChainContext> {
    private readonly bufferedAttacks = new WeakSet<PlayerWorldState>();
    private readonly pendingHits = new WeakMap<PlayerWorldState, PendingSkillHit[]>();
    private readonly lastHorizontalDirection = new WeakMap<PlayerWorldState, "left" | "right">();

    interrupt(state: PlayerWorldState): void {
        this.bufferedAttacks.delete(state);
        this.pendingHits.delete(state);
        state.attackCombo = 0;
    }

    cancelForDash(state: PlayerWorldState): void {
        this.interrupt(state);
    }

    execute({ room, state, attackPressed }: PlayerChainContext): WorldChainResult {
        if (state.direction === "left" || state.direction === "right") {
            this.lastHorizontalDirection.set(state, state.direction);
        }

        this.processPendingHits(room, state);

        if (state.dashing) {
            return WorldChainResult.CONTINUE;
        }

        if (state.attackCooldownTicks > 0) {
            if (attackPressed) this.bufferedAttacks.add(state);
            return WorldChainResult.CONTINUE;
        }

        const bufferedAttack = this.bufferedAttacks.has(state);
        if (!bufferedAttack) state.attackCombo = 0;
        if (!attackPressed && !bufferedAttack) return WorldChainResult.CONTINUE;
        this.bufferedAttacks.delete(state);

        state.attackCombo =
            bufferedAttack && state.attackCombo > 0 && state.attackCombo < 3
                ? state.attackCombo + 1
                : 1;
        const skill = skillService.getByCode(`swordman_slash_${state.attackCombo}`);
        if (!skill) {
            state.attackCombo = 0;
            return WorldChainResult.CONTINUE;
        }

        const attackDirection = this.lastHorizontalDirection.get(state) ?? "right";
        state.direction = attackDirection;

        const events = [...skill.skillHitEvents].sort(
            (a, b) => a.triggerTicks - b.triggerTicks || a.eventIndex - b.eventIndex
        );
        let damageRemainder = 0;
        this.pendingHits.set(
            state,
            events.map((event) => {
                const exactDamage = getSkillHitDamage(state, event);
                const accumulatedDamage = exactDamage + damageRemainder;
                const rawDamage = exactDamage > 0 ? Math.floor(accumulatedDamage) : 0;
                damageRemainder = exactDamage > 0 ? accumulatedDamage - rawDamage : damageRemainder;

                return {
                    ticksUntilHit: skillEventTicks(event.triggerTicks, room.tickRate),
                    event,
                    rawDamage,
                    direction: attackDirection,
                };
            })
        );

        const skillDurationTicks = Math.max(
            Math.ceil((skill.castTimeMs * room.tickRate) / 1000),
            ...events.map((event) => skillEventTicks(event.triggerTicks, room.tickRate)),
            millisecondsToTicks(PLAYER_ATTACK_DURATION_MS[state.attackCombo - 1], room.tickRate)
        );
        state.startAttack(skillDurationTicks);
        return WorldChainResult.CONTINUE;
    }

    hasBufferedAttack(state: PlayerWorldState): boolean {
        return this.bufferedAttacks.has(state);
    }

    private processPendingHits(room: WorldRoom, state: PlayerWorldState): void {
        const pendingHits = this.pendingHits.get(state);
        if (!pendingHits) return;

        for (let index = pendingHits.length - 1; index >= 0; index--) {
            const pendingHit = pendingHits[index];
            pendingHit.ticksUntilHit--;
            if (pendingHit.ticksUntilHit > 0) continue;

            this.applyHitEvent(room, state, pendingHit);
            pendingHits.splice(index, 1);
        }

        if (pendingHits.length === 0) this.pendingHits.delete(state);
    }

    private applyHitEvent(room: WorldRoom, state: PlayerWorldState, hit: PendingSkillHit): void {
        if (hit.rawDamage <= 0) return;

        for (const target of room.state.monsters.values()) {
            if (
                target.hp <= 0 ||
                !intersectsSkillHitEvent(
                    { x: state.x, y: state.y, direction: hit.direction },
                    target.x,
                    target.y,
                    target.hitbox,
                    hit.event
                )
            ) {
                continue;
            }

            target.setAggroTarget(state.id);
            target.takeDamage(
                Math.max(1, hit.rawDamage - target.defense),
                Math.ceil(target.attackCooldownMs / (1000 / room.tickRate))
            );
        }
    }
}

function getSkillHitDamage(state: PlayerWorldState, event: SkillHitEvent): number {
    return event.effects
        .filter((effect) => effect.effectType === SkillEffectType.DAMAGE)
        .reduce((total, effect) => {
            const scaledStat = effect.scalingType === DamageScalingType.ATTACK ? state.attack : 0;
            return total + effect.baseValue + scaledStat * effect.scalingValue;
        }, 0);
}

function findAutoTarget(room: WorldRoom, player: PlayerWorldState) {
    return findTargetsInRange(room, player, PLAYER_AUTO_TARGET_RANGE)[0];
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
    return [...room.state.monsters.values()]
        .filter((monster) => monster.hp > 0)
        .filter(
            (monster) => distanceSquared(player.x, player.y, monster.x, monster.y) <= range ** 2
        )
        .sort(
            (a, b) =>
                distanceSquared(player.x, player.y, a.x, a.y) -
                    distanceSquared(player.x, player.y, b.x, b.y) || a.id.localeCompare(b.id)
        );
}

function faceTarget(player: PlayerWorldState, dx: number) {
    if (dx < 0) player.direction = "left";
    else if (dx > 0) player.direction = "right";
}
