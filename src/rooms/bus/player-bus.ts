import type {
    PlayerAttachRequest,
    PlayerDetachRequest,
    PlayerPresenceRequest,
    PlayerReplicaSnapshot,
    PlayerSyncRequest,
    PlayerWriteAck,
    PlayerWriteRequest,
} from "@/modules/player/types/player-sync.type.js";
import { callRoom } from "@/rooms/bus/room-bus.js";
import type { WorldNotifier } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import type { GlobalPlayerApi } from "@/modules/player/types/global-player-api.type.js";

/** World → global: gọi global room của game server (roomId = `serverId`) qua `rooms/bus`. */
export class BusGlobalPlayerApi implements GlobalPlayerApi {
    constructor(private readonly serverId: string) {}

    attach(request: PlayerAttachRequest) {
        return callRoom<PlayerReplicaSnapshot>(this.serverId, "playerAttach", request);
    }

    snapshot(request: PlayerAttachRequest) {
        return callRoom<PlayerReplicaSnapshot>(this.serverId, "playerSnapshot", request);
    }

    write(request: PlayerWriteRequest) {
        return callRoom<PlayerWriteAck>(this.serverId, "playerWrite", request);
    }

    sync(request: PlayerSyncRequest) {
        return callRoom(this.serverId, "playerSync", request);
    }

    presence(request: PlayerPresenceRequest) {
        return callRoom(this.serverId, "playerPresence", request);
    }

    detach(request: PlayerDetachRequest) {
        return callRoom(this.serverId, "playerDetach", request);
    }
}

/** Global → world: gọi world room (roomId lấy từ `presence`) đang giữ bản sao của player. */
export const busWorldNotifier: WorldNotifier = {
    groupChanged: (worldRoomId, message) =>
        void callRoom(worldRoomId, "playerGroupChanged", message),
    partyChanged: (worldRoomId, message) =>
        void callRoom(worldRoomId, "playerPartyChanged", message),
};
