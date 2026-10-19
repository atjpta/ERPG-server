import { CrowdControlType, SkillEffectType } from "@/modules/skills/enums/skill.enum.js";
import { calculateDamage } from "@/rooms/world/modules/combat/chains/damage.world.chain.js";
import type { HitboxColliderState } from "@/rooms/world/modules/combat/schemas/hitbox-collider.world.state.js";
import { combatSeed } from "@/rooms/world/modules/combat/utils/combat-roll.world.util.js";
import type { PendingSkillHit } from "@/rooms/world/modules/combat/utils/skill-attack.world.util.js";
import type { MonsterWorldState } from "@/rooms/world/modules/monsters/schemas/monster.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/**
 * Bên gây ra một hit (đòn đánh, đạn, vùng). Player (`id` = playerId) tra lại mỗi lần trúng (có thể đã
 * rời room trong lúc đạn bay); monster giữ chính object của nó.
 */
export type SkillOwner =
    { kind: "player"; id: string } | { kind: "monster"; id: string; monster: MonsterWorldState };

/** Một mục tiêu còn sống của `owner`, ở vị trí mà hit được tính. */
export interface SkillTarget {
    id: string;
    x: number;
    y: number;
    hitbox: HitboxColliderState;
}

export const playerSkillOwner = (player: PlayerWorldState): SkillOwner => ({
    kind: "player",
    id: player.id,
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
        const sessionId = room.sessionOf.get(owner.id);
        const seen = sessionId ? room.rewind.lastSeenBy(sessionId) : undefined;
        for (const monster of room.state.monsters.values()) {
            if (monster.hp <= 0) continue;
            targets.push({
                id: monster.id,
                x: seen ? seen.value(monster, "x") : monster.x,
                y: seen ? seen.value(monster, "y") : monster.y,
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
    player: PlayerWorldState
): SkillTarget | undefined {
    if (!player.targetId) return undefined;
    return findSkillTargets(room, playerSkillOwner(player)).find(
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

    if (room.isLeavingPlayer?.(owner.id)) return false;
    const attacker = room.state.players.get(owner.id);
    const target = room.state.monsters.find((monster) => monster.id === targetId);
    if (
        !attacker ||
        attacker.pendingMapCode ||
        attacker.id !== owner.id ||
        !target ||
        target.hp <= 0
    )
        return false;

    target.setAggroTarget(attacker.id);
    const result = calculateDamage({
        attacker: attacker.toDamageCombatant(),
        defender: target.toDamageCombatant(),
        event,
        seed,
    });
    if (!result.hit) return false;

    target.takeDamage(result.damage);
    attacker.heal(result.heal);
    // Hiệu ứng choáng của hit: chỉ khi trúng và mục tiêu còn sống.
    if (target.hp > 0) {
        for (const effect of event.effects) {
            if (
                effect.effectType === SkillEffectType.APPLY_STATUS &&
                effect.crowdControlType === CrowdControlType.STUN &&
                effect.durationMs > 0
            ) {
                target.stun(millisecondsToTicks(effect.durationMs, room.tickRate));
            }
            if (effect.effectType === SkillEffectType.KNOCKBACK && effect.baseValue > 0) {
                // Đẩy ra xa người đánh theo đường từ người đánh tới mục tiêu (không có hướng thì theo hướng mặt).
                const dx = target.x - attacker.x;
                const dy = target.y - attacker.y;
                const length = Math.hypot(dx, dy);
                const facing = attacker.direction === "left" ? -1 : 1;
                target.knockback(
                    length > 1e-6 ? dx / length : facing,
                    length > 1e-6 ? dy / length : 0,
                    effect.baseValue,
                    millisecondsToTicks(Math.max(effect.durationMs, 1), room.tickRate)
                );
            }
        }
    }
    // Đòn kết liễu → người đánh nhận thưởng (mỗi monster chỉ chết một lần).
    if (target.hp <= 0) {
        room.onMonsterKilled(owner.id, attacker, target);
    }
    return true;
}
