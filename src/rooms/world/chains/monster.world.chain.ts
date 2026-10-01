import { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

const MONSTER_AGGRO_RADIUS = 4;
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
        const target = [...room.state.players.values()]
            .filter((player) => player.hp > 0)
            .filter(
                (player) =>
                    distanceSquared(monster.x, monster.y, player.x, player.y) <=
                    MONSTER_AGGRO_RADIUS ** 2
            )
            .sort(
                (a, b) =>
                    distanceSquared(monster.x, monster.y, a.x, a.y) -
                    distanceSquared(monster.x, monster.y, b.x, b.y)
            )[0];
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
            if (distance <= monster.attackRange) return WorldChainResult.CONTINUE;

            this.move(room, monster, dx, dy, dt);
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
            pending.ticks--;
            if (pending.ticks > 0) return WorldChainResult.STOP;

            this.pendingAttacks.delete(monster);
            this.resolveAttack(room, monster, pending.target);
            return WorldChainResult.STOP;
        }

        if (!target || dx === undefined || dy === undefined) return WorldChainResult.STOP;

        monster.faceTarget(dx, dy);
        if (monster.attackCooldownTicks > 0) return WorldChainResult.STOP;

        monster.startAttackWindup();
        this.pendingAttacks.set(monster, {
            target,
            ticks: millisecondsToTicks(MONSTER_ATTACK_WINDUP_MS, room.tickRate),
        });
        return WorldChainResult.STOP;
    }

    private resolveAttack(
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
        monster.startAttack(Math.ceil(monster.attackCooldownMs / (1000 / room.tickRate)));
    }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const randomIdleTicks = (tickRate: number) => {
    const idleMs =
        MONSTER_IDLE_MIN_MS + Math.random() * (MONSTER_IDLE_MAX_MS - MONSTER_IDLE_MIN_MS);
    return Math.max(1, Math.ceil(idleMs / (1000 / tickRate)));
};

const millisecondsToTicks = (milliseconds: number, tickRate: number) =>
    Math.max(1, Math.ceil(milliseconds / (1000 / tickRate)));
