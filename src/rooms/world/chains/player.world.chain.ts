import { distanceSquared } from "@/rooms/world/utils/world.util.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { MoveCommand, applyWorldMove } from "@/rooms/world/simulation/movement.step.js";
import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";

export interface PlayerChainContext {
    room: WorldRoom;
    state: PlayerWorldState;
    move: MoveCommand;
    attackRequested: boolean;
    dashRequested: boolean;
    dt: number;
    scheduleRespawn: (player: PlayerWorldState) => void;
}

export class PlayerDeathChain implements WorldChainAction<PlayerChainContext> {
    execute({ state, scheduleRespawn }: PlayerChainContext): WorldChainResult {
        if (state.hp > 0) return WorldChainResult.CONTINUE;
        state.setDead();
        scheduleRespawn(state);
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

export class PlayerMoveChain implements WorldChainAction<PlayerChainContext> {
    execute({ room, state, move, dt }: PlayerChainContext): WorldChainResult {
        state.recoverPosition(room.map.spawnX, room.map.spawnY, room.map.width, room.map.height);
        applyWorldMove(state, move, room.map, dt, state.dashing ? 2 : 1, 4);
        return WorldChainResult.CONTINUE;
    }
}

export class PlayerAttackChain implements WorldChainAction<PlayerChainContext> {
    execute({ room, state, attackRequested }: PlayerChainContext): WorldChainResult {
        if (!attackRequested || state.dashing || state.attackCooldownTicks > 0) {
            return WorldChainResult.CONTINUE;
        }

        const facing = state.direction;
        const target = [...room.state.monsters.values()]
            .filter((monster) => monster.hp > 0)
            .filter((monster) => {
                const dx = monster.x - state.x;
                const dy = monster.y - state.y;
                if (facing === "left") return dx <= 0.15 && dx >= -1.2 && Math.abs(dy) <= 0.65;
                if (facing === "right") return dx >= -0.15 && dx <= 1.2 && Math.abs(dy) <= 0.65;
                if (facing === "up") return dy <= 0.15 && dy >= -1.2 && Math.abs(dx) <= 0.65;
                return dy >= -0.15 && dy <= 1.2 && Math.abs(dx) <= 0.65;
            })
            .sort(
                (a, b) =>
                    distanceSquared(state.x, state.y, a.x, a.y) -
                    distanceSquared(state.x, state.y, b.x, b.y)
            )[0];

        if (target) target.takeDamage(Math.max(1, state.attack - target.defense));
        state.startAttack(8);
        return WorldChainResult.CONTINUE;
    }
}
