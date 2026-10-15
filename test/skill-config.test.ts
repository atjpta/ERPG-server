import assert from "node:assert/strict";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import {
    SkillType,
    HitDelivery,
    HitShape,
    SkillEffectType,
    DamageScalingType,
} from "@/modules/skills/enums/skill.enum.js";
import { DEFAULT_PLAYER_TARGET_CONFIG } from "@/modules/master-data/schemas/player-target-config.schema.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { skillService } from "@/modules/skills/services/skill.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { sendSkillConfigs } from "@/rooms/world/services/skill-config.world.service.js";
import { buildClientSkillConfig } from "@/rooms/world/utils/skill-config.world.util.js";
import { WorldMessage } from "@/rooms/world/world.message.js";

const skill = {
    id: "server-skill",
    code: "server_slash",
    skillType: SkillType.MELEE,
    basicAttack: true,
    castRange: 2,
    castTimeMs: 100,
    animationMs: 600,
    cooldownMs: 500,
    manaCost: 3,
    skillHitEvents: [
        {
            eventIndex: 0,
            triggerTicks: 3,
            shape: HitShape.CIRCLE,
            radius: 2,
            delivery: HitDelivery.HITBOX,
            effects: [
                {
                    effectType: SkillEffectType.DAMAGE,
                    baseValue: 10,
                    scalingType: DamageScalingType.ATTACK,
                    scalingValue: 1.5,
                },
            ],
        },
    ],
} as unknown as Skill;

describe("requested skill configuration", () => {
    it("uses simulation ticks and resolves partial class targeting rules", () => {
        const config = buildClientSkillConfig([skill], {
            ...DEFAULT_PLAYER_TARGET_CONFIG,
            classes: { archer: { autoTargetMargin: 3 } },
        });
        assert.equal(config.tickRate, 40);
        assert.equal(config.skills[0].castTicks, 4);
        assert.equal(config.skills[0].durationTicks, 28);
        assert.equal(config.skills[0].hitEvents[0].triggerTicks, 6);
        assert.equal(config.skills[0].hitEvents[0].damageBase, 10);
        assert.equal(config.skills[0].hitEvents[0].damageAttackScaling, 1.5);
        assert.deepEqual(config.targeting.classes.archer, {
            ...DEFAULT_PLAYER_TARGET_CONFIG.default,
            autoTargetMargin: 3,
        });
    });

    it("replies only to the requester using current simulation caches", () => {
        const getAll = skillService.getAll;
        const getMasterData = masterDataCacheService.get;
        const sent: { type: string; payload: string }[] = [];
        const client = {
            send: (type: string, payload: string) => sent.push({ type, payload }),
        } as unknown as PlayerClient;
        try {
            skillService.getAll = () => [skill];
            masterDataCacheService.get = (() =>
                DEFAULT_PLAYER_TARGET_CONFIG) as typeof getMasterData;
            assert.equal(sent.length, 0);
            sendSkillConfigs(client);
            assert.equal(sent.length, 1);
            assert.equal(sent[0].type, WorldMessage.SKILL_CONFIGS);
            const response = JSON.parse(sent[0].payload);
            assert.equal(response.skills[0].id, "server-skill");
            assert.equal(
                response.targeting.keepTargetRange,
                DEFAULT_PLAYER_TARGET_CONFIG.keepTargetRange
            );

            // A later request reads the updated server cache, not an exported file or stale response.
            skillService.getAll = () => [{ ...skill, manaCost: 17 }];
            sendSkillConfigs(client);
            assert.equal(JSON.parse(sent[1].payload).skills[0].manaCost, 17);
        } finally {
            skillService.getAll = getAll;
            masterDataCacheService.get = getMasterData;
        }
    });

    it("returns a failure response when the runtime configuration is unavailable", () => {
        const getMasterData = masterDataCacheService.get;
        const logError = console.error;
        let response: { error?: string };
        const client = {
            send: (_type: string, payload: string) => {
                response = JSON.parse(payload);
            },
        } as unknown as PlayerClient;
        try {
            masterDataCacheService.get = () => {
                throw new Error("missing runtime config");
            };
            console.error = () => undefined;
            sendSkillConfigs(client);
            assert.equal(response.error, "Skill configuration unavailable.");
        } finally {
            masterDataCacheService.get = getMasterData;
            console.error = logError;
        }
    });
});
