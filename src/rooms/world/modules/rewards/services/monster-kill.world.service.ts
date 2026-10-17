import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { monsterRewardService } from "@/modules/rewards/services/monster-reward.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { MonsterWorldState } from "@/rooms/world/modules/monsters/schemas/monster.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { partyRewardWorldService } from "@/rooms/world/modules/rewards/services/party-reward.world.service.js";
import { rewardTasksWorldService } from "@/rooms/world/modules/rewards/services/reward-tasks.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Post-kill effects, wired by the room rather than imported by combat. */
export class MonsterKillWorldService {
    grant(
        room: WorldRoom,
        sessionId: string,
        player: PlayerWorldState,
        monster: MonsterWorldState
    ): void {
        questWorldService.onEvent(room, sessionId, player, {
            type: QuestObjectiveType.KILL,
            targetCode: monster.code,
        });
        const recipients = partyRewardWorldService
            .killParticipants(room, sessionId, player)
            .map((member) => member.sessionId);
        rewardTasksWorldService.track(
            room,
            partyRewardWorldService.grantKill(
                room,
                sessionId,
                player,
                monsterRewardService.roll(
                    {
                        type: monster.monsterType,
                        rarity: monster.rarity,
                        level: monster.level,
                        baseLevel: monster.definition.level,
                        biome: monster.biome,
                        drops: monster.drops,
                    },
                    Math.random
                ),
                { code: monster.code, level: monster.level }
            ),
            recipients
        );
    }
}
export const monsterKillWorldService = new MonsterKillWorldService();
