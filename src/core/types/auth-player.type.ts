/** Verified player identity shared by API and realtime infrastructure; independent of JWT. */
export interface AuthPlayer {
    typ: "player";
    userId: string;
    /** Do not use `sessionId`: Colyseus reserves it for the connection identity. */
    userSessionId: string;
    playerId: string;
    serverId: string;
}
