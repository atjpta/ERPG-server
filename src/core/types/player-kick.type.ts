import type { KickReason } from "@/core/enums/kick-reason.enum.js";

/** Omitted filters match every connection belonging to the user. */
export interface KickFilter {
    playerId?: string;
    userSessionId?: string;
    /** `<roomId>:<client.sessionId>` of a connection that should remain online. */
    exceptConnection?: string;
}

export interface KickMessage extends KickFilter {
    reason: KickReason;
}
