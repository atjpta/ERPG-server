import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import {
    DamageScalingType,
    HitDelivery,
    SkillEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import {
    resolvePlayerTargetRule,
    type PlayerTargetConfig,
} from "@/modules/master-data/schemas/player-target-config.schema.js";
import {
    getSkillCastTicks,
    getSkillDurationTicks,
} from "@/rooms/world/modules/combat/utils/skill-attack.world.util.js";
import {
    WORLD_TICK_RATE,
    millisecondsToTicks,
    skillEventTicks,
} from "@/rooms/world/utils/tick.world.util.js";

/** Shared wire format for requested runtime config and offline Editor exports. */
export function buildClientSkillConfig(skills: readonly Skill[], targeting: PlayerTargetConfig) {
    return {
        tickRate: WORLD_TICK_RATE,
        targeting: {
            keepTargetRange: targeting.keepTargetRange,
            approachDeadzone: targeting.approachDeadzone,
            default: targeting.default,
            classes: Object.fromEntries(
                Object.keys(targeting.classes).map((code) => [
                    code,
                    resolvePlayerTargetRule(targeting, code),
                ])
            ),
            autoBattle: targeting.autoBattle,
        },
        skills: skills.map(toClientSkill),
    };
}

function toClientSkill(skill: Skill) {
    return {
        id: skill.id,
        code: skill.code,
        skillType: skill.skillType,
        castRange: skill.castRange,
        cooldownMs: skill.cooldownMs,
        manaCost: skill.manaCost,
        /** Thuộc combo đánh thường (theo thứ tự trong `skills` của player/monster). */
        basicAttack: skill.basicAttack,
        /** Chỉ skill lướt tới mục tiêu (`isChargeSkill`): tốc độ, thời gian dư, quãng lướt không mục tiêu — đã điền mặc định. */
        charge: skillService.isChargeSkill(skill)
            ? {
                  ...skillService.getChargeConfig(skill),
                  freeDistance: skillService.getChargeConfig(skill).freeDistance ?? skill.castRange,
              }
            : null,
        /** Số tick chờ từ lúc bấm đến lúc anim + hit event bắt đầu (`castTimeMs`; 0 = ngay). */
        castTicks: getSkillCastTicks(skill, WORLD_TICK_RATE),
        /** Số tick mô phỏng của cả đòn (chờ + anim, khoá di chuyển) — giống PlayerAttackChain. */
        durationTicks: getSkillDurationTicks(skill, WORLD_TICK_RATE),
        hitEvents: skillService.sortSkillHitEvents(skill.skillHitEvents).map((event) => {
            const damageEffects = event.effects.filter(
                (effect) => effect.effectType === SkillEffectType.DAMAGE
            );
            return {
                /** Tick mô phỏng (WORLD_TICK_RATE) tính từ lúc bắt đầu đòn. */
                triggerTicks: skillEventTicks(event.triggerTicks, WORLD_TICK_RATE),
                shape: event.shape,
                range: event.range,
                width: event.width,
                height: event.height,
                radius: event.radius,
                angle: event.angle,
                /** Vùng đánh xoay theo hướng ngắm (về phía target đang chọn) thay vì chỉ trái / phải. */
                aimed: event.aimed ?? false,
                /** Vùng đánh / chỗ đạn và vùng bắt đầu so với người đánh (ô): về trước theo hướng mặt hoặc ngắm, và lên trên. */
                offsetX: event.offsetX ?? 0,
                offsetY: event.offsetY ?? 0,
                /** Hit cùng nhóm = một hit vẽ từng frame (-1 = hit riêng): mỗi mục tiêu chỉ trúng frame đầu tiên chạm nó. */
                hitGroup: event.hitGroup ?? -1,
                /** Damage gốc để client predict: damageBase + attack × damageAttackScaling (server tính đủ qua `calculateDamage`). */
                damageBase: damageEffects.reduce((total, effect) => total + effect.baseValue, 0),
                damageAttackScaling: damageEffects
                    .filter((effect) => effect.scalingType === DamageScalingType.ATTACK)
                    .reduce((total, effect) => total + effect.scalingValue, 0),
                /** HITBOX / PROJECTILE / AREA — xem SkillDeliveryWorldService. */
                delivery: event.delivery ?? HitDelivery.HITBOX,
                projectile: event.projectile
                    ? {
                          speed: event.projectile.speed,
                          maxDistance: event.projectile.maxDistance,
                          radius: event.projectile.radius,
                          hitBehavior: event.projectile.hitBehavior,
                          maxHits: event.projectile.maxHits,
                      }
                    : null,
                area: event.area
                    ? {
                          /** Tick mô phỏng từ lúc đặt vùng tới lúc gây damage (0 = ngay). */
                          delayTicks:
                              event.area.delayMs > 0
                                  ? millisecondsToTicks(event.area.delayMs, WORLD_TICK_RATE)
                                  : 0,
                          untargetedDistance: event.area.untargetedDistance,
                          /** Vùng kéo dài: số lần gây damage và chu kỳ giữa hai lần (tick); 1 / 0 = chỉ một lần. */
                          ...(event.area.durationMs
                              ? {
                                    pulseTicks: millisecondsToTicks(
                                        event.area.tickMs ?? 1000,
                                        WORLD_TICK_RATE
                                    ),
                                    pulses:
                                        Math.floor(
                                            Math.max(
                                                0,
                                                millisecondsToTicks(
                                                    event.area.durationMs,
                                                    WORLD_TICK_RATE
                                                ) -
                                                    (event.area.delayMs > 0
                                                        ? millisecondsToTicks(
                                                              event.area.delayMs,
                                                              WORLD_TICK_RATE
                                                          )
                                                        : 0)
                                            ) /
                                                millisecondsToTicks(
                                                    event.area.tickMs ?? 1000,
                                                    WORLD_TICK_RATE
                                                )
                                        ) + 1,
                                }
                              : { pulseTicks: 0, pulses: 1 }),
                      }
                    : null,
                /** Vùng buff (AURA): thời gian và bán kính theo level, để client tính hồi chiêu và phóng prefab. */
                aura: event.aura
                    ? {
                          durationMs: event.aura.durationMs,
                          durationMsPerLevel: event.aura.durationMsPerLevel,
                          radiusX: event.aura.radiusX,
                          radiusY: event.aura.radiusY,
                          radiusScalePerLevel: event.aura.radiusScalePerLevel,
                      }
                    : null,
                /** Hồi đồng đội quanh người dùng (ALLIES): vùng elip và lượng hồi. */
                allies: event.allies
                    ? {
                          radiusX: event.allies.radiusX,
                          radiusY: event.allies.radiusY,
                          healBase: event.allies.healBase,
                          healScaling: event.allies.healScaling,
                      }
                    : null,
            };
        }),
    };
}
