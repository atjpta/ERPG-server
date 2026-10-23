import { calc } from "@/core/calc/calc.service.js";
import type { CalcValue } from "@/core/calc/calc.interface.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import {
    DamageScalingType,
    DamageType,
    SkillEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import {
    WorldChain,
    WorldChainAction,
    WorldChainResult,
} from "@/modules/world/chains/world.chain.js";
import { combatRoll } from "@/modules/combat/utils/combat-roll.util.js";

/** Tỉ lệ trúng khi accuracy = evasion; mỗi điểm chênh lệch ±1%, kẹp trong [MIN, MAX]. */
export const BASE_HIT_CHANCE = 0.95;
export const HIT_CHANCE_PER_POINT = 0.01;
export const MIN_HIT_CHANCE = 0.5;
export const MAX_HIT_CHANCE = 1;
/** Hệ số nhân chí mạng khi bên đánh không có stat `critical_damage` (monster). */
export const DEFAULT_CRITICAL_DAMAGE = 1.5;
/** Giáp giảm sát thương theo `100 / (100 + giáp)`: 100 giáp = giảm 50%, không bao giờ về 0. */
export const DEFENSE_CONSTANT = 100;

export interface DamageCombatant {
    id: string;
    stats: Stats;
    hp: number;
    maxHp: number;
    /** Có = monster (để áp `damage_to_monsters` / `damage_to_bosses`). */
    monsterType?: MonsterType;
}

/** Phần damage của từng effect DAMAGE — mỗi phần giảm theo loại giáp riêng. */
export interface DamagePart {
    damageType: DamageType;
    amount: CalcValue;
}

export interface DamageContext {
    attacker: DamageCombatant;
    defender: DamageCombatant;
    event: SkillHitEvent;
    /** Xem `combatSeed` — quyết định roll trúng/chí mạng. */
    seed: string;
    parts: DamagePart[];
    hit: boolean;
    critical: boolean;
    /** Damage cuối cùng trừ vào HP mục tiêu. */
    damage: number;
    /** HP bên đánh hồi lại (hút máu). */
    heal: number;
}

export type DamageResult = Pick<DamageContext, "hit" | "critical" | "damage" | "heal">;

const stat = (stats: Stats, key: StatKey): CalcValue => calc.of(stats[key] ?? 0).round();

/**
 * 1. Damage gốc = baseValue + chỉ số scale × scalingValue. ATTACK/MAGIC_ATTACK/MAX_HP/DEFENSE/
 * MAGIC_DEFENSE lấy của bên đánh; CURRENT_HP/MISSING_HP lấy của mục tiêu (kiểu "% máu hiện tại").
 */
export class DamageBaseChain implements WorldChainAction<DamageContext> {
    execute(context: DamageContext): WorldChainResult {
        const { attacker, defender } = context;
        for (const effect of context.event.effects) {
            if (effect.effectType !== SkillEffectType.DAMAGE) continue;
            const amount = calc
                .of(effect.baseValue)
                .plus(
                    this.scaledStat(effect.scalingType, attacker, defender).times(
                        effect.scalingValue
                    )
                )
                .round();
            if (amount.gt(0)) context.parts.push({ damageType: effect.damageType, amount });
        }
        return context.parts.length > 0 ? WorldChainResult.CONTINUE : WorldChainResult.STOP;
    }

    private scaledStat(
        scalingType: DamageScalingType,
        attacker: DamageCombatant,
        defender: DamageCombatant
    ): CalcValue {
        switch (scalingType) {
            case DamageScalingType.ATTACK:
                return stat(attacker.stats, StatKey.PHYSICAL_ATTACK);
            case DamageScalingType.MAGIC_ATTACK:
                return stat(attacker.stats, StatKey.MAGIC_ATTACK);
            case DamageScalingType.MAX_HP:
                return calc.of(attacker.maxHp);
            case DamageScalingType.DEFENSE:
                return stat(attacker.stats, StatKey.PHYSICAL_DEFENSE);
            case DamageScalingType.MAGIC_DEFENSE:
                return stat(attacker.stats, StatKey.MAGIC_DEFENSE);
            case DamageScalingType.CURRENT_HP:
                return calc.of(defender.hp);
            case DamageScalingType.MISSING_HP:
                return calc.max(0, calc.of(defender.maxHp).minus(defender.hp));
            default:
                return calc.of(0);
        }
    }
}

/** 2. Trúng/trượt: accuracy bên đánh vs evasion mục tiêu. Đòn chỉ có TRUE damage luôn trúng. */
export class DamageHitChain implements WorldChainAction<DamageContext> {
    execute(context: DamageContext): WorldChainResult {
        if (context.parts.every((part) => part.damageType === DamageType.TRUE)) {
            context.hit = true;
            return WorldChainResult.CONTINUE;
        }
        const difference = stat(context.attacker.stats, StatKey.ACCURACY).minus(
            stat(context.defender.stats, StatKey.EVASION)
        );
        const hitChance = calc
            .clamp(
                difference.times(HIT_CHANCE_PER_POINT).plus(BASE_HIT_CHANCE),
                MIN_HIT_CHANCE,
                MAX_HIT_CHANCE
            )
            .round();
        context.hit = hitChance.gt(combatRoll(context.seed, "hit"));
        return context.hit ? WorldChainResult.CONTINUE : WorldChainResult.STOP;
    }
}

/** 3. Chí mạng: roll theo `critical_chance`, trúng thì nhân `critical_damage` cho mọi phần. */
export class DamageCriticalChain implements WorldChainAction<DamageContext> {
    execute(context: DamageContext): WorldChainResult {
        const { stats } = context.attacker;
        const chance = calc.clamp(stat(stats, StatKey.CRITICAL_CHANCE), 0, 1);
        context.critical = chance.gt(combatRoll(context.seed, "critical"));
        if (context.critical) {
            const multiplier = calc.max(
                1,
                stats[StatKey.CRITICAL_DAMAGE] ?? DEFAULT_CRITICAL_DAMAGE
            );
            for (const part of context.parts) {
                part.amount = part.amount.times(multiplier).round();
            }
        }
        return WorldChainResult.CONTINUE;
    }
}

/**
 * 4. Giảm theo giáp: PHYSICAL dùng `physical_defense`/`physical_penetration`, MAGICAL dùng
 * `magic_defense`/`magic_penetration`, TRUE bỏ qua. Xuyên giáp là tỉ lệ 0 → 1 trên giáp mục tiêu.
 */
export class DamageDefenseChain implements WorldChainAction<DamageContext> {
    execute(context: DamageContext): WorldChainResult {
        for (const part of context.parts) {
            const keys = this.defenseKeys(part.damageType);
            if (!keys) continue;
            const penetration = calc.clamp(stat(context.attacker.stats, keys.penetration), 0, 1);
            const defense = calc
                .max(0, stat(context.defender.stats, keys.defense))
                .times(calc.of(1).minus(penetration));
            part.amount = part.amount
                .times(DEFENSE_CONSTANT)
                .div(defense.round().plus(DEFENSE_CONSTANT))
                .round();
        }
        return WorldChainResult.CONTINUE;
    }

    private defenseKeys(damageType: DamageType) {
        if (damageType === DamageType.PHYSICAL) {
            return { defense: StatKey.PHYSICAL_DEFENSE, penetration: StatKey.PHYSICAL_PENETRATION };
        }
        if (damageType === DamageType.MAGICAL) {
            return { defense: StatKey.MAGIC_DEFENSE, penetration: StatKey.MAGIC_PENETRATION };
        }
        return undefined;
    }
}

/** 5. Tăng sát thương lên monster: `damage_to_monsters` cho mọi monster, cộng `damage_to_bosses` nếu là boss. */
export class DamageBonusChain implements WorldChainAction<DamageContext> {
    execute(context: DamageContext): WorldChainResult {
        const { monsterType } = context.defender;
        if (monsterType === undefined) return WorldChainResult.CONTINUE;

        const { stats } = context.attacker;
        let bonus = stat(stats, StatKey.DAMAGE_TO_MONSTERS);
        if (monsterType === MonsterType.BOSS) {
            bonus = bonus.plus(stat(stats, StatKey.DAMAGE_TO_BOSSES));
        }
        const multiplier = calc.max(0, bonus.plus(1));
        for (const part of context.parts) part.amount = part.amount.times(multiplier).round();
        return WorldChainResult.CONTINUE;
    }
}

/** 6. Làm tròn xuống (tối thiểu 1) rồi tính hút máu theo `life_steal` trên damage thực gây ra. */
export class DamageFinalChain implements WorldChainAction<DamageContext> {
    execute(context: DamageContext): WorldChainResult {
        const total = calc.sum([0, ...context.parts.map((part) => part.amount)]);
        context.damage = Math.min(Math.max(1, total.floor()), context.defender.hp);
        const lifeSteal = calc.clamp(stat(context.attacker.stats, StatKey.LIFE_STEAL), 0, 1);
        context.heal = lifeSteal.times(context.damage).floor();
        return WorldChainResult.CONTINUE;
    }
}

const damageChain = new WorldChain<DamageContext>([
    new DamageBaseChain(),
    new DamageHitChain(),
    new DamageCriticalChain(),
    new DamageDefenseChain(),
    new DamageBonusChain(),
    new DamageFinalChain(),
]);

/** Tính damage 1 hit event lên 1 mục tiêu. Hàm thuần — người gọi tự trừ HP / hồi máu. */
export function calculateDamage(props: {
    attacker: DamageCombatant;
    defender: DamageCombatant;
    event: SkillHitEvent;
    seed: string;
}): DamageResult {
    const context: DamageContext = {
        ...props,
        parts: [],
        hit: false,
        critical: false,
        damage: 0,
        heal: 0,
    };
    damageChain.execute(context);
    return {
        hit: context.hit,
        critical: context.critical,
        damage: context.damage,
        heal: context.heal,
    };
}

export const hasDamageEffect = (event: SkillHitEvent) =>
    event.effects.some((effect) => effect.effectType === SkillEffectType.DAMAGE);
