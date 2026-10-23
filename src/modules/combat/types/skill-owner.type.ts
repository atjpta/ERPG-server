import type { HitboxColliderState } from "@/modules/combat/state/hitbox-collider.state.js";
import type { MonsterWorldState } from "@/modules/monsters/state/monster.state.js";

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
