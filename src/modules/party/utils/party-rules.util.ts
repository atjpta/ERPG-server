import {
    PartyDungeonDenyReason,
    type PartyMemberInfo,
} from "@/modules/party/schemas/party.schema.js";

/**
 * Chủ mới khi `leaderId` rời: thành viên vào party sớm nhất còn lại (`joinOrder` theo thứ tự vào).
 * `undefined` nếu không còn ai.
 */
export const nextLeader = (joinOrder: readonly string[], leaderId: string): string | undefined =>
    joinOrder.find((playerId) => playerId !== leaderId);

export interface DungeonEntryFailure {
    playerId: string;
    name: string;
    reason: PartyDungeonDenyReason;
}

/**
 * Kiểm điều kiện cả party vào dungeon (all-or-nothing): trả danh sách người không đạt, rỗng = được vào.
 * Mỗi người một lý do (ưu tiên: ngoài world > đang trong dungeon > chết > thiếu level); quá sức chứa
 * thì thêm một dòng cho chủ party (`leaderId`).
 */
export const checkPartyDungeonEntry = (
    members: readonly PartyMemberInfo[],
    options: { minLevel: number; capacity: number; leaderId: string }
): DungeonEntryFailure[] => {
    const failures: DungeonEntryFailure[] = [];
    for (const member of members) {
        const reason = !member.inWorld
            ? PartyDungeonDenyReason.OFFLINE
            : member.inDungeon
              ? PartyDungeonDenyReason.IN_DUNGEON
              : member.hp <= 0
                ? PartyDungeonDenyReason.DEAD
                : member.level < options.minLevel
                  ? PartyDungeonDenyReason.LEVEL_TOO_LOW
                  : undefined;
        if (reason) failures.push({ playerId: member.playerId, name: member.name, reason });
    }
    if (members.length > options.capacity) {
        const leader = members.find((member) => member.playerId === options.leaderId);
        failures.push({
            playerId: options.leaderId,
            name: leader?.name ?? "",
            reason: PartyDungeonDenyReason.PARTY_TOO_LARGE,
        });
    }
    return failures;
};
