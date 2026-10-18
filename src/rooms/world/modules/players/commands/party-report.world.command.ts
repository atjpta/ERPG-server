import { callRoom } from "@/core/rooms/room.integration.js";
import { ReportPartyCommand } from "@/rooms/party/commands/report.party.command.js";
import type { PartyMemberInfo } from "@/rooms/party/party.shared.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

const reportRevisions = new WeakMap<WorldRoom, number>();

export class PartyReportWorldCommand extends Command<WorldRoom, void> {
    async execute() {
        const room = this.room;

        const revision = (reportRevisions.get(room) ?? 0) + 1;
        reportRevisions.set(room, revision);
        const byParty = new Map<
            string,
            (Pick<PartyMemberInfo, "playerId"> & Partial<PartyMemberInfo>)[]
        >();
        for (const player of room.state.players.values()) {
            if (!player.partyRoomId) continue;
            const info = playerPartyWorldService.toMemberInfo(room, player);
            const key = JSON.stringify([
                info.level,
                info.hp,
                info.maxHp,
                info.mapCode,
                info.inDungeon,
            ]);
            if (playerPartyWorldService.lastReport.get(player) === key) continue;

            const list = byParty.get(player.partyRoomId) ?? [];
            list.push({
                playerId: info.playerId,
                level: info.level,
                hp: info.hp,
                maxHp: info.maxHp,
                mapCode: info.mapCode,
                inDungeon: info.inDungeon,
            });
            byParty.set(player.partyRoomId, list);
        }
        for (const [partyRoomId, updates] of byParty) {
            void callRoom(partyRoomId, ReportPartyCommand, {
                worldRoomId: room.roomId,
                revision,
                updates,
            }).then((reported) => {
                if (!reported.success) return;
                for (const update of updates) {
                    const player = playerPartyWorldService.findPlayer(
                        room,
                        update.playerId
                    )?.player;
                    if (player?.partyRoomId === partyRoomId)
                        playerPartyWorldService.lastReport.set(
                            player,
                            JSON.stringify([
                                update.level,
                                update.hp,
                                update.maxHp,
                                update.mapCode,
                                update.inDungeon,
                            ])
                        );
                }
            });
        }
    }
}
