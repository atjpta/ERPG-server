import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { monsterRewardService } from "@/modules/rewards/services/monster-reward.service.js";
import type { MonsterWorldState } from "@/modules/monsters/state/monster.state.js";
import { partyLootService } from "@/modules/rewards/services/party-loot.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
export class PartyRewardWorldService {
    /**
     * Thành viên cùng party đang ở **room này** và còn sống (gồm `attacker`). Không party → chỉ `attacker`.
     * Phạm vi chia thưởng = cùng map (cùng room), không xét khoảng cách.
     */
    killParticipants(
        room: WorldRoom,
        attackerPlayerId: string,
        attacker: PlayerWorldState
    ): { playerId: string; player: PlayerWorldState }[] {
        const solo = [{ playerId: attackerPlayerId, player: attacker }];
        if (!attacker.partyId) return solo;
        const members: { playerId: string; player: PlayerWorldState }[] = [];
        for (const [playerId, player] of room.state.players) {
            if (
                player.partyId === attacker.partyId &&
                player.hp > 0 &&
                !player.pendingMapCode &&
                !room.leavingPlayers.has(playerId)
            ) {
                members.push({ playerId, player });
            }
        }
        return members.some((member) => member.player === attacker) ? members : solo;
    }

    /** Quái bị hạ: tiến độ quest kill cho người kết liễu rồi chia thưởng (party hoặc một mình). */
    onMonsterKilled(
        room: WorldRoom,
        playerId: string,
        player: PlayerWorldState,
        monster: MonsterWorldState
    ): void {
        questWorldService.onEvent(room, playerId, player, {
            type: QuestObjectiveType.KILL,
            targetCode: monster.code,
        });
        this.grantKill(
            room,
            playerId,
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
        );
    }

    /**
     * Phần thưởng khi hạ quái cho party cùng room (`shareKillReward`): exp chia đều có bonus, vàng chia
     * đều, item chia theo cách chủ party chọn (`player.partyLootMode`, global đẩy xuống khi đổi); thành viên
     * chênh level với quái quá `maxLevelGap` không được chia (người kết liễu luôn được tính). Mọi thành viên
     * còn sống trong room đều nhận tiến độ quest kill như người kết liễu. Tính ngay trong room, không RPC.
     * Con trỏ luân phiên (round robin) tính theo từng (room, party).
     */
    grantKill(
        room: WorldRoom,
        attackerPlayerId: string,
        attacker: PlayerWorldState,
        reward: Reward,
        target: { code: string; level: number }
    ): void {
        const participants = this.killParticipants(room, attackerPlayerId, attacker);
        if (participants.length <= 1) {
            rewardWorldService.grant(room, attackerPlayerId, attacker, reward);
            return;
        }
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        const partyId = attacker.partyId!;
        room.partyLoot.prune(
            new Set([...room.state.players.values()].map((player) => player.partyId))
        );
        const { rewards, nextCursor } = partyLootService.shareKillReward(
            reward,
            attacker.id,
            participants.map(({ player }) => ({ id: player.id, level: player.level })),
            target.level,
            {
                expBonusPerExtraMember: config.expBonusPerExtraMember,
                maxLevelGap: config.maxLevelGap,
                shareGold: config.shareGold,
                lootMode: attacker.partyLootMode,
                cursor: room.partyLoot.cursorOf(partyId),
            }
        );
        room.partyLoot.advance(partyId, nextCursor);
        for (const { playerId, player } of participants) {
            const share = rewards.get(player.id);
            if (share) rewardWorldService.grant(room, playerId, player, share);
            if (player === attacker) continue;
            questWorldService.onEvent(room, playerId, player, {
                type: QuestObjectiveType.KILL,
                targetCode: target.code,
            });
        }
    }
}
export const partyRewardWorldService = new PartyRewardWorldService();
