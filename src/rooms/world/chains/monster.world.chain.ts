import { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { intersectsSkillHitEvent } from "@/rooms/world/utils/skill-hitbox.world.util.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import {
    HorizontalDirection,
    PendingSkillHit,
    buildPendingSkillHits,
    getSkillDurationTicks,
    tickPendingSkillHits,
} from "@/rooms/world/utils/skill-attack.world.util.js";

const MONSTER_DETECTION_RADIUS = 4;
const MONSTER_LEASH_RADIUS = 8;
const MONSTER_ROAM_RADIUS = 2;
const MONSTER_ROAM_ARRIVAL_DISTANCE = 0.15;
const MONSTER_IDLE_MIN_MS = 1_000;
const MONSTER_IDLE_MAX_MS = 3_000;
const MONSTER_ATTACK_WINDUP_MS = 300;
interface RoamTarget {
    x: number;
    y: number;
}

interface PendingAttack {
    target: PlayerWorldState;
    ticks: number;
    hitEvents: PendingSkillHit[];
    cooldownTicks: number;
    skillAttack: boolean;
}

export interface MonsterChainContext {
    room: WorldRoom;
    monster: MonsterWorldState;
    dt: number;
    scheduleRespawn: (monster: MonsterWorldState) => void;
    target?: PlayerWorldState;
    dx?: number;
    dy?: number;
    distance?: number;
}

export class MonsterDeathChain implements WorldChainAction<MonsterChainContext> {
    execute({ monster, scheduleRespawn }: MonsterChainContext): WorldChainResult {
        if (monster.hp > 0) return WorldChainResult.CONTINUE;
        monster.setDead();
        scheduleRespawn(monster);
        return WorldChainResult.STOP;
    }
}

export class MonsterFindTargetChain implements WorldChainAction<MonsterChainContext> {
    execute(context: MonsterChainContext): WorldChainResult {
        const { room, monster } = context;
        const aggroTargetId = monster.getAggroTargetId();
        let target = aggroTargetId
            ? [...room.state.players.values()].find((player) => player.id === aggroTargetId)
            : undefined;
        if (
            target &&
            (target.hp <= 0 ||
                distanceSquared(monster.spawnX, monster.spawnY, target.x, target.y) >
                    MONSTER_LEASH_RADIUS ** 2)
        ) {
            monster.clearAggroTarget();
            target = undefined;
        }
        if (!target) {
            target = [...room.state.players.values()]
                .filter((player) => player.hp > 0)
                .filter(
                    (player) =>
                        distanceSquared(monster.x, monster.y, player.x, player.y) <=
                            MONSTER_DETECTION_RADIUS ** 2 &&
                        distanceSquared(monster.spawnX, monster.spawnY, player.x, player.y) <=
                            MONSTER_LEASH_RADIUS ** 2
                )
                .sort(
                    (a, b) =>
                        distanceSquared(monster.x, monster.y, a.x, a.y) -
                        distanceSquared(monster.x, monster.y, b.x, b.y)
                )[0];
            if (target) monster.setAggroTarget(target.id);
        }
        if (!target) {
            context.target = undefined;
            context.dx = undefined;
            context.dy = undefined;
            context.distance = undefined;
            return WorldChainResult.CONTINUE;
        }

        context.target = target;
        context.dx = target.x - monster.x;
        context.dy = target.y - monster.y;
        context.distance = Math.hypot(context.dx, context.dy);
        return WorldChainResult.CONTINUE;
    }
}

export class MonsterMoveChain implements WorldChainAction<MonsterChainContext> {
    private readonly roamTargets = new WeakMap<MonsterWorldState, RoamTarget>();
    private readonly idleTicks = new WeakMap<MonsterWorldState, number>();

    constructor(private readonly attackChain: MonsterAttackChain) {}

    execute(context: MonsterChainContext): WorldChainResult {
        const { room, monster, target, distance, dx, dy, dt } = context;
        if (monster.hitInterrupted) {
            monster.hitInterrupted = false;
            monster.moving = false;
            this.attackChain.cancelPendingAttack(monster);
            return WorldChainResult.STOP;
        }
        if (this.attackChain.hasPendingAttack(monster)) {
            monster.moving = false;
            return WorldChainResult.CONTINUE;
        }
        if (target) {
            this.roamTargets.delete(monster);
            this.idleTicks.delete(monster);
            if (distance === undefined || dx === undefined || dy === undefined) {
                return WorldChainResult.STOP;
            }
            monster.lookAt(dx);
            if (monster.attackCooldownTicks > 0) {
                monster.moving = false;
                return WorldChainResult.STOP;
            }
            if (isMonsterSkillHitboxInRange(monster, target, distance)) {
                monster.moving = false;
                return WorldChainResult.CONTINUE;
            }

            this.move(room, monster, dx, dy, dt);
            monster.lookAt(dx);
            return WorldChainResult.STOP;
        }

        const remainingIdleTicks = this.idleTicks.get(monster) ?? 0;
        if (remainingIdleTicks > 0) {
            monster.moving = false;
            if (remainingIdleTicks === 1) this.idleTicks.delete(monster);
            else this.idleTicks.set(monster, remainingIdleTicks - 1);
            return WorldChainResult.STOP;
        }

        const roamTarget = this.getRoamTarget(room, monster);
        const roamDx = roamTarget.x - monster.x;
        const roamDy = roamTarget.y - monster.y;
        if (Math.hypot(roamDx, roamDy) <= MONSTER_ROAM_ARRIVAL_DISTANCE) {
            monster.moving = false;
            this.roamTargets.delete(monster);
            this.idleTicks.set(monster, randomIdleTicks(room.tickRate));
            return WorldChainResult.STOP;
        }

        this.move(room, monster, roamDx, roamDy, dt);
        return WorldChainResult.STOP;
    }

    private move(
        room: WorldRoom,
        monster: MonsterWorldState,
        dx: number,
        dy: number,
        dt: number
    ): void {
        const moveX = Math.abs(dx) > 0.1 ? Math.sign(dx) : 0;
        const moveY = Math.abs(dy) > 0.1 ? Math.sign(dy) : 0;
        applyWorldMove(monster, { moveX, moveY }, room.map, dt);
    }

    private getRoamTarget(room: WorldRoom, monster: MonsterWorldState): RoamTarget {
        const current = this.roamTargets.get(monster);
        if (current) return current;

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * MONSTER_ROAM_RADIUS;
        const target = {
            x: clamp(monster.spawnX + Math.cos(angle) * radius, 0, room.map.width),
            y: clamp(monster.spawnY + Math.sin(angle) * radius, 0, room.map.height),
        };
        this.roamTargets.set(monster, target);
        return target;
    }
}

export class MonsterAttackChain implements WorldChainAction<MonsterChainContext> {
    private readonly pendingAttacks = new WeakMap<MonsterWorldState, PendingAttack>();

    hasPendingAttack(monster: MonsterWorldState): boolean {
        return this.pendingAttacks.has(monster);
    }

    cancelPendingAttack(monster: MonsterWorldState): void {
        this.pendingAttacks.delete(monster);
    }

    execute({ room, monster, target, dx, dy }: MonsterChainContext): WorldChainResult {
        const pending = this.pendingAttacks.get(monster);
        if (pending) {
            monster.startAttackWindup();
            tickPendingSkillHits(pending.hitEvents, (hit) =>
                this.resolveSkillHit(room, monster, hit)
            );
            pending.ticks--;
            if (pending.ticks > 0) return WorldChainResult.STOP;

            this.pendingAttacks.delete(monster);
            if (!pending.skillAttack) {
                this.resolveFallbackAttack(room, monster, pending.target);
            }
            monster.startAttack(pending.cooldownTicks);
            return WorldChainResult.STOP;
        }

        if (!target || dx === undefined || dy === undefined) return WorldChainResult.STOP;

        monster.faceTarget(dx);
        if (monster.attackCooldownTicks > 0) return WorldChainResult.STOP;

        const attackDirection: HorizontalDirection =
            dx < 0
                ? Direction.LEFT
                : dx > 0
                  ? Direction.RIGHT
                  : monster.direction === Direction.LEFT
                    ? Direction.LEFT
                    : Direction.RIGHT;
        monster.direction = attackDirection;
        monster.startAttackWindup();
        const skill = getMonsterAttackSkill(monster);
        if (skill) {
            this.pendingAttacks.set(monster, {
                target,
                ticks: getSkillDurationTicks(skill, room.tickRate),
                hitEvents: buildPendingSkillHits(
                    skill,
                    monster.attack,
                    attackDirection,
                    room.tickRate
                ),
                cooldownTicks: millisecondsToTicks(
                    skill.cooldownMs > 0 ? skill.cooldownMs : monster.attackCooldownMs,
                    room.tickRate
                ),
                skillAttack: true,
            });
            return WorldChainResult.STOP;
        }

        this.pendingAttacks.set(monster, {
            target,
            ticks: millisecondsToTicks(MONSTER_ATTACK_WINDUP_MS, room.tickRate),
            hitEvents: [],
            cooldownTicks: millisecondsToTicks(monster.attackCooldownMs, room.tickRate),
            skillAttack: false,
        });
        return WorldChainResult.STOP;
    }

    private resolveSkillHit(
        room: WorldRoom,
        monster: MonsterWorldState,
        hit: PendingSkillHit
    ): void {
        const origin = { x: monster.x, y: monster.y, direction: hit.direction };
        for (const target of room.state.players.values()) {
            if (target.hp <= 0) continue;
            if (!intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, hit.event)) {
                continue;
            }

            target.takeDamage(Math.max(1, hit.rawDamage - target.defense));
        }
    }

    private resolveFallbackAttack(
        room: WorldRoom,
        monster: MonsterWorldState,
        target: PlayerWorldState
    ): void {
        const targetIsPresent = [...room.state.players.values()].includes(target);
        const distance = Math.hypot(target.x - monster.x, target.y - monster.y);
        if (
            targetIsPresent &&
            target.hp > 0 &&
            !target.dashing &&
            distance <= monster.attackRange
        ) {
            target.takeDamage(Math.max(1, monster.attack - target.defense));
        }
    }
}

function getMonsterAttackSkill(monster: MonsterWorldState) {
    return skillService.getByCode(`${monster.code}_slash`);
}

function isMonsterSkillHitboxInRange(
    monster: MonsterWorldState,
    target: PlayerWorldState,
    distance: number
): boolean {
    const skill = getMonsterAttackSkill(monster);
    const hitEvents = skill?.skillHitEvents ?? [];
    if (hitEvents.length === 0) return distance <= (skill?.castRange ?? monster.attackRange);

    const direction =
        target.x < monster.x
            ? Direction.LEFT
            : target.x > monster.x
              ? Direction.RIGHT
              : monster.direction;

    return hitEvents.some((event) =>
        intersectsSkillHitEvent(
            { x: monster.x, y: monster.y, direction },
            target.x,
            target.y,
            target.hitbox,
            event
        )
    );
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const randomIdleTicks = (tickRate: number) => {
    const idleMs =
        MONSTER_IDLE_MIN_MS + Math.random() * (MONSTER_IDLE_MAX_MS - MONSTER_IDLE_MIN_MS);
    return millisecondsToTicks(idleMs, tickRate);
};
