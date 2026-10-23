import type { Response } from "@/core/response/response.js";
import type {
    PlayerAttachRequest,
    PlayerDetachRequest,
    PlayerPresenceRequest,
    PlayerReplicaSnapshot,
    PlayerSyncRequest,
    PlayerWriteAck,
    PlayerWriteRequest,
} from "@/modules/player/types/player-sync.type.js";

/** Những gì world nhờ global làm với dữ liệu player (qua `rooms/bus`, hoặc gọi thẳng `PlayerStateManager` trong test). */
export interface GlobalPlayerApi {
    attach(request: PlayerAttachRequest): Promise<Response<PlayerReplicaSnapshot>>;
    snapshot(request: PlayerAttachRequest): Promise<Response<PlayerReplicaSnapshot>>;
    write(request: PlayerWriteRequest): Promise<Response<PlayerWriteAck>>;
    sync(request: PlayerSyncRequest): Promise<Response>;
    presence(request: PlayerPresenceRequest): Promise<Response>;
    detach(request: PlayerDetachRequest): Promise<Response>;
}
