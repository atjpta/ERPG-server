import { callRoom } from "@/core/rooms/room.integration.js";
import { AllocateKillRewardPartyCommand } from "@/rooms/party/modules/loot/commands/allocate-kill-reward.party.command.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { PartyLootMode, shareKillReward } from "@/rooms/party/party.shared.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { randomUUID } from "node:crypto";
export class PartyRewardWorldService {
    /**
     * Thành viên cùng party đang ở **room này** và còn sống (gồm `attacker`). Không party → chỉ `attacker`.
     * Phạm vi chia thưởng = cùng map (cùng room), không xét khoảng cách.
     */
    killParticipants(
        room: WorldRoom,
        attackerSessionId: string,
        attacker: PlayerWorldState
    ): { sessionId: string; player: PlayerWorldState }[] {
        const solo = [{ sessionId: attackerSessionId, player: attacker }];
        if (!attacker.partyRoomId) return solo;
        const members: { sessionId: string; player: PlayerWorldState }[] = [];
        for (const [sessionId, player] of room.state.players) {
            if (
                player.partyRoomId === attacker.partyRoomId &&
                player.hp > 0 &&
                !player.pendingMapCode &&
                !room.isLeavingSession?.(sessionId)
            ) {
                members.push({ sessionId, player });
            }
        }
        return members.some((member) => member.player === attacker) ? members : solo;
    }

    /**
     * Phần thưởng khi hạ quái cho party cùng room (`shareKillReward`): exp chia đều có bonus, vàng chia
     * đều, item chia theo cách chủ party chọn; thành viên chênh level với quái quá `maxLevelGap` không
     * được chia (người kết liễu luôn được tính). Mọi thành viên còn sống trong room đều nhận tiến độ
     * quest kill như người kết liễu.
     */
    async grantKill(
        room: WorldRoom,
        attackerSessionId: string,
        attacker: PlayerWorldState,
        reward: Reward,
        target: { code: string; level: number }
    ): Promise<void> {
        const participants = this.killParticipants(room, attackerSessionId, attacker);
        if (participants.length <= 1) {
            rewardWorldService.grant(room, attackerSessionId, attacker, reward);
            return;
        }
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        const partyRoomId = attacker.partyRoomId!;
        const request = {
            eventId: randomUUID(),
            killerId: attacker.id,
            monsterLevel: target.level,
            reward,
            participants: participants.map(({ player }) => ({
                id: player.id,
                level: player.level,
            })),
        };
        let allocation = await callRoom(partyRoomId, AllocateKillRewardPartyCommand, request);
        if (!allocation.success)
            allocation = await callRoom(partyRoomId, AllocateKillRewardPartyCommand, request);
        const rewards = allocation.success
            ? new Map(allocation.data.map((share) => [share.playerId, share.reward]))
            : shareKillReward(reward, attacker.id, request.participants, target.level, {
                  expBonusPerExtraMember: config.expBonusPerExtraMember,
                  maxLevelGap: config.maxLevelGap,
                  shareGold: config.shareGold,
                  lootMode: PartyLootMode.KILLER,
                  cursor: 0,
              }).rewards;
        for (const { sessionId, player } of participants) {
            const share = rewards.get(player.id);
            if (share) rewardWorldService.grant(room, sessionId, player, share);
            if (player === attacker) continue;
            questWorldService.onEvent(room, sessionId, player, {
                type: QuestObjectiveType.KILL,
                targetCode: target.code,
            });
        }
    }
}
export const partyRewardWorldService = new PartyRewardWorldService();
