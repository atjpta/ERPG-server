import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { MoveCommand, applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";

const PLAYER_AUTO_TARGET_RANGE = 4;
const PLAYER_AUTO_FACE_RANGE = PLAYER_AUTO_TARGET_RANGE / 2;
const PLAYER_ATTACK_COOLDOWN_TICKS = 8;
const PLAYER_COMBO_WINDOW_TICKS = 20;

export interface PlayerChainContext {
    room: WorldRoom;
    state: PlayerWorldState;
    move: MoveCommand;
    attackRequested: boolean;
    dashRequested: boolean;
    targetSwitchRequested: boolean;
    dt: number;
    scheduleRespawn: (player: PlayerWorldState) => void;
}

export class PlayerDeathChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ state, scheduleRespawn }: PlayerChainContext): WorldChainResult {
        if (state.hp > 0) return WorldChainResult.CONTINUE;
        state.setDead();
        this.attackChain.interrupt(state, false);
        scheduleRespawn(state);
        return WorldChainResult.STOP;
    }
}

export class PlayerHitInterruptChain implements WorldChainAction<PlayerChainContext> {
    constructor(private readonly attackChain: PlayerAttackChain) {}

    execute({ state, attackRequested }: PlayerChainContext): WorldChainResult {
        if (!state.hitInterrupted) return WorldChainResult.CONTINUE;

        state.hitInterrupted = false;
        this.attackChain.interrupt(state, attackRequested);
        return WorldChainResult.STOP;
    }
}

export class PlayerDashChain implements WorldChainAction<PlayerChainContext> {
    execute({ state, move, dashRequested }: PlayerChainContext): WorldChainResult {
        state.chainDash(dashRequested);
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

    execute({
        room,
        state,
        targetSwitchRequested,
        dashRequested,
    }: PlayerChainContext): WorldChainResult {
        const wasRequested = this.previousSwitchInput.get(state) ?? false;
        this.previousSwitchInput.set(state, targetSwitchRequested);
        if (!targetSwitchRequested || wasRequested) return WorldChainResult.CONTINUE;

        const targets = findTargetsInRange(room, state, PLAYER_AUTO_TARGET_RANGE * 2);
        if (targets.length === 0) {
            state.targetId = "";
            state.targetLocked = false;
            return WorldChainResult.CONTINUE;
        }

        const currentIndex = targets.findIndex((target) => target.id === state.targetId);
        const nextTarget = targets[(currentIndex + 1) % targets.length];
        state.targetId = nextTarget.id;
        state.targetLocked = true;
        if (
            !state.dashing &&
            !dashRequested &&
            distanceSquared(state.x, state.y, nextTarget.x, nextTarget.y) <=
                PLAYER_AUTO_FACE_RANGE ** 2
        ) {
            faceTarget(state, nextTarget.x - state.x, nextTarget.y - state.y);
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerMoveChain implements WorldChainAction<PlayerChainContext> {
    execute({ room, state, move, dt }: PlayerChainContext): WorldChainResult {
        state.recoverPosition(room.map.spawnX, room.map.spawnY, room.map.width, room.map.height);
        applyWorldMove(state, move, room.map, dt, state.dashing ? 2 : 1, 4);
        if (!state.dashing && state.moving) {
            let target = state.targetLocked
                ? findTargetById(room, state, state.targetId, PLAYER_AUTO_TARGET_RANGE * 2)
                : undefined;
            if (state.targetLocked && !target) {
                state.targetId = "";
                state.targetLocked = false;
            }
            target ??= findAutoTarget(room, state);
            state.targetId = target?.id ?? "";
            if (
                target &&
                distanceSquared(state.x, state.y, target.x, target.y) <= PLAYER_AUTO_FACE_RANGE ** 2
            ) {
                faceTarget(state, target.x - state.x, target.y - state.y);
            }
        }
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerAttackChain implements WorldChainAction<PlayerChainContext> {
    private readonly previousAttackInput = new WeakMap<PlayerWorldState, boolean>();
    private readonly comboWindowTicks = new WeakMap<PlayerWorldState, number>();
    private readonly bufferedAttacks = new WeakSet<PlayerWorldState>();

    interrupt(state: PlayerWorldState, attackRequested: boolean): void {
        this.previousAttackInput.set(state, attackRequested);
        this.comboWindowTicks.delete(state);
        this.bufferedAttacks.delete(state);
        state.attackCombo = 0;
    }

    execute({ room, state, attackRequested }: PlayerChainContext): WorldChainResult {
        const wasAttackRequested = this.previousAttackInput.get(state) ?? false;
        this.previousAttackInput.set(state, attackRequested);
        const attackPressed = attackRequested && !wasAttackRequested;

        let comboWindow = Math.max(0, (this.comboWindowTicks.get(state) ?? 0) - 1);
        if (comboWindow === 0 && state.attackCombo > 0) {
            state.attackCombo = 0;
            this.bufferedAttacks.delete(state);
        }
        this.comboWindowTicks.set(state, comboWindow);

        if (state.dashing) {
            this.bufferedAttacks.delete(state);
            return WorldChainResult.CONTINUE;
        }

        if (attackPressed && state.attackCooldownTicks > 0 && comboWindow > 0) {
            this.bufferedAttacks.add(state);
        }
        if (state.attackCooldownTicks > 0) return WorldChainResult.CONTINUE;

        const bufferedAttack = this.bufferedAttacks.has(state);
        if (!attackPressed && !bufferedAttack) return WorldChainResult.CONTINUE;
        this.bufferedAttacks.delete(state);

        state.attackCombo =
            comboWindow > 0 && state.attackCombo > 0 && state.attackCombo < 3
                ? state.attackCombo + 1
                : 1;
        this.comboWindowTicks.set(state, PLAYER_COMBO_WINDOW_TICKS);

        const target = [...room.state.monsters.values()]
            .filter((monster) => monster.hp > 0)
            .filter((monster) =>
                intersectsMeleeHitbox(state, monster.x, monster.y, monster.collider)
            )
            .sort(
                (a, b) =>
                    distanceSquared(state.x, state.y, a.x, a.y) -
                    distanceSquared(state.x, state.y, b.x, b.y)
            )[0];

        if (target) {
            target.setAggroTarget(state.id);
            target.takeDamage(
                Math.max(1, state.attack - target.defense),
                Math.ceil(target.attackCooldownMs / (1000 / room.tickRate))
            );
        }
        state.startAttack(PLAYER_ATTACK_COOLDOWN_TICKS);
        return WorldChainResult.CONTINUE;
    }
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

function faceTarget(player: PlayerWorldState, dx: number, dy: number) {
    if (Math.abs(dx) > Math.abs(dy)) player.direction = dx < 0 ? "left" : "right";
    else player.direction = dy < 0 ? "up" : "down";
}

function intersectsMeleeHitbox(
    player: PlayerWorldState,
    targetX: number,
    targetY: number,
    targetCollider: HitboxColliderState
): boolean {
    const facing = player.direction;
    const forwardX = facing === "left" ? -1 : facing === "right" ? 1 : 0;
    const forwardY = facing === "up" ? -1 : facing === "down" ? 1 : 0;
    const lateralX = -forwardY;
    const lateralY = forwardX;

    const targetCenterX = targetX + targetCollider.offsetX;
    const targetCenterY = targetY + targetCollider.offsetY;
    const targetDx = targetCenterX - player.x;
    const targetDy = targetCenterY - player.y;
    const targetForward = targetDx * forwardX + targetDy * forwardY;
    const targetLateral = targetDx * lateralX + targetDy * lateralY;

    const targetForwardHalf =
        Math.abs(forwardX) > 0 ? targetCollider.width / 2 : targetCollider.height / 2;
    const targetLateralHalf =
        Math.abs(lateralX) > 0 ? targetCollider.width / 2 : targetCollider.height / 2;
    const hitboxForwardStart = player.hitbox.offsetX;
    const hitboxForwardEnd = hitboxForwardStart + player.hitbox.width;
    const hitboxLateralHalf = player.hitbox.height / 2;

    return (
        targetForward + targetForwardHalf >= hitboxForwardStart &&
        targetForward - targetForwardHalf <= hitboxForwardEnd &&
        Math.abs(targetLateral - player.hitbox.offsetY) <= hitboxLateralHalf + targetLateralHalf
    );
}
