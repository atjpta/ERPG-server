import { monsterRewardService } from "@/modules/rewards/services/monster-reward.service.js";
import { calculateDamage } from "@/rooms/world/chains/damage.world.chain.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import type { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import { combatSeed } from "@/rooms/world/utils/combat-roll.world.util.js";
import type { PendingSkillHit } from "@/rooms/world/utils/skill-attack.world.util.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/**
 * Bên gây ra một hit (đòn đánh, đạn, vùng). Player tra lại theo `sessionId` mỗi lần trúng (có thể đã
 * rời room trong lúc đạn bay); monster giữ chính object của nó.
 */
export type SkillOwner =
    | { kind: "player"; id: string; sessionId: string }
    | { kind: "monster"; id: string; monster: MonsterWorldState };

/** Một mục tiêu còn sống của `owner`, ở vị trí mà hit được tính. */
export interface SkillTarget {
    id: string;
    x: number;
    y: number;
    hitbox: HitboxColliderState;
}

export const playerSkillOwner = (sessionId: string, player: PlayerWorldState): SkillOwner => ({
    kind: "player",
    id: player.id,
    sessionId,
});

export const monsterSkillOwner = (monster: MonsterWorldState): SkillOwner => ({
    kind: "monster",
    id: monster.id,
    monster,
});

/**
 * Mục tiêu còn sống của `owner`. Player đánh monster theo vị trí monster mà chính client đó đang vẽ
 * (`rewind.lastSeenBy` — "thấy trúng là trúng", cả với đạn đang bay); monster đánh player theo vị trí live.
 */
export function findSkillTargets(room: WorldRoom, owner: SkillOwner): SkillTarget[] {
    const targets: SkillTarget[] = [];
    if (owner.kind === "player") {
        const seen = room.rewind.lastSeenBy(owner.sessionId);
        for (const monster of room.state.monsters.values()) {
            if (monster.hp <= 0) continue;
            targets.push({
                id: monster.id,
                x: seen.value(monster, "x"),
                y: seen.value(monster, "y"),
                hitbox: monster.hitbox,
            });
        }
        return targets;
    }
    for (const player of room.state.players.values()) {
        if (player.hp <= 0) continue;
        targets.push({ id: player.id, x: player.x, y: player.y, hitbox: player.hitbox });
    }
    return targets;
}

/** Mục tiêu đang chọn của player (khoá hoặc tự chọn) — để ngắm đạn / đặt vùng. */
export function findPlayerAimTarget(
    room: WorldRoom,
    sessionId: string,
    player: PlayerWorldState
): SkillTarget | undefined {
    if (!player.targetId) return undefined;
    return findSkillTargets(room, playerSkillOwner(sessionId, player)).find(
        (target) => target.id === player.targetId
    );
}

/** Phần của một hit cần để tính damage (hit đang chờ, đạn hoặc vùng). */
export type SkillHitSource = Pick<PendingSkillHit, "event" | "attackSerial" | "eventIndex">;

/**
 * Tính và áp damage của `hit.event` lên `targetId`: trừ HP, hút máu, aggro, thưởng khi kết liễu monster.
 * `false` khi bên đánh/mục tiêu không còn hoặc trượt.
 */
export function applySkillHit(
    room: WorldRoom,
    owner: SkillOwner,
    targetId: string,
    hit: SkillHitSource
): boolean {
    const { event } = hit;
    const seed = combatSeed(owner.id, hit.attackSerial, hit.eventIndex, targetId);
    if (owner.kind === "monster") {
        const target = [...room.state.players.values()].find((player) => player.id === targetId);
        if (!target || target.hp <= 0) return false;
        const result = calculateDamage({
            attacker: owner.monster.toDamageCombatant(),
            defender: target.toDamageCombatant(),
            event,
            seed,
        });
        if (!result.hit) return false;
        target.takeDamage(result.damage);
        owner.monster.heal(result.heal);
        return true;
    }

    const attacker = room.state.players.get(owner.sessionId);
    const target = room.state.monsters.find((monster) => monster.id === targetId);
    if (!attacker || attacker.id !== owner.id || !target || target.hp <= 0) return false;

    target.setAggroTarget(attacker.id);
    const result = calculateDamage({
        attacker: attacker.toDamageCombatant(),
        defender: target.toDamageCombatant(),
        event,
        seed,
    });
    if (!result.hit) return false;

    target.takeDamage(result.damage, millisecondsToTicks(target.attackCooldownMs, room.tickRate));
    attacker.heal(result.heal);
    // Đòn kết liễu → người đánh nhận thưởng (mỗi monster chỉ chết một lần).
    if (target.hp <= 0) {
        rewardWorldService.grant(
            room,
            owner.sessionId,
            attacker,
            monsterRewardService.roll({
                type: target.monsterType,
                rarity: target.rarity,
                level: target.level,
                biome: target.biome,
                drops: target.drops,
            })
        );
    }
    return true;
}
