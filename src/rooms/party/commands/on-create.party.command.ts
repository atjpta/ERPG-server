import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { ExpireInvitesPartyCommand } from "@/rooms/party/commands/expire-invites.party.command.js";
import { HeartbeatPartyCommand } from "@/rooms/party/commands/heartbeat.party.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import type { PartyRoomOptions } from "@/rooms/party/types/party-room.type.js";
import { Command } from "@colyseus/command";

export class OnCreatePartyCommand extends Command<PartyRoom, PartyRoomOptions> {
    async execute(options: PartyRoomOptions) {
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        this.room.maxClients = config.maxMembers;
        this.room.state.init(config, { ...options.leader, inWorld: true });
        this.room.worldRoomOf.set(options.leader.playerId, options.leaderWorldRoomId);
        this.room.serverId = (
            await playerService.assertPlayableOrFail(options.leader.playerId)
        ).serverId;
        this.clock.setInterval(() => {
            void this.room.dispatcher.dispatch(new ExpireInvitesPartyCommand());
        }, 1000);
        this.clock.setInterval(() => {
            void this.room.dispatcher.dispatch(new HeartbeatPartyCommand());
        }, 30000);
    }
}
