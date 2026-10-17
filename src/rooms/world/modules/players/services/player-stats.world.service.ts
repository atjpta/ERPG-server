import { levelService } from "@/modules/levels/services/level.service.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { AttributeKey } from "@/modules/player/schemas/stat.schema.js";
import { allocateAttributePoints } from "@/modules/player/services/player-progress.service.js";
import {
    PlayerStatService,
    playerStatService,
} from "@/modules/player/services/player-stat.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { AttributeSummary } from "@/rooms/world/types/world-message.type.js";

export class PlayerStatsWorldService {
    setLevelProgress(state: PlayerWorldState, level: number, exp: number) {
        state.level = level;
        state.exp = exp;
        state.expToNextLevel = levelService.getExpToNext(level) ?? 0;
    }

    refreshStats(state: PlayerWorldState) {
        const { attributes, stats } = playerStatService.compute(state);
        const previousMaxHp = state.maxHp ?? 0;
        const previousMaxMp = state.maxMp ?? 0;
        state.attributes = attributes;
        state.stats = stats;
        state.maxHp = PlayerStatService.whole(stats, StatKey.MAX_HP);
        state.maxMp = PlayerStatService.whole(stats, StatKey.MAX_MP);
        state.moveSpeed = stats[StatKey.MOVE_SPEED] ?? 0;
        state.attack = PlayerStatService.whole(stats, StatKey.PHYSICAL_ATTACK);
        state.defense = PlayerStatService.whole(stats, StatKey.PHYSICAL_DEFENSE);
        if (state.hp !== undefined && state.hp > 0) {
            state.hp = Math.min(state.maxHp, Math.max(1, state.hp + state.maxHp - previousMaxHp));
        }
        if (state.mp !== undefined) {
            state.mp = Math.min(state.maxMp, Math.max(0, state.mp + state.maxMp - previousMaxMp));
        }
    }

    /** Cộng điểm tiềm năng; trả lỗi (string) nếu không hợp lệ, `undefined` khi thành công. */
    allocateAttributes(
        state: PlayerWorldState,
        request: Partial<Record<AttributeKey, number>>
    ): string | undefined {
        const result = allocateAttributePoints(
            state.allocatedAttributes,
            state.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        state.allocatedAttributes = result.allocatedAttributes;
        state.attributePoints = result.attributePoints;
        state.refreshStats();
        return undefined;
    }

    /** Kết quả nếu cộng điểm như `request` — không đổi state; trả lỗi (string) nếu không hợp lệ. */
    previewAttributes(
        state: PlayerWorldState,
        request: Partial<Record<AttributeKey, number>>
    ): AttributeSummary | string {
        const result = allocateAttributePoints(
            state.allocatedAttributes,
            state.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        const { attributes, stats } = playerStatService.compute({
            classId: state.classId,
            allocatedAttributes: result.allocatedAttributes,
            equipments: state.equipments,
        });
        return {
            attributePoints: result.attributePoints,
            allocatedAttributes: { ...result.allocatedAttributes },
            attributes: { ...attributes },
            stats: { ...stats },
        };
    }

    getAttributeSummary(state: PlayerWorldState): AttributeSummary {
        return {
            attributePoints: state.attributePoints,
            allocatedAttributes: { ...state.allocatedAttributes },
            attributes: { ...state.attributes },
            stats: { ...state.stats },
        };
    }
}
export const playerStatsWorldService = new PlayerStatsWorldService();
