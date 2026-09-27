import { schema, t, type SchemaType } from "@colyseus/schema";

/** Player hiển thị trên map — chỉ chứa dữ liệu mọi người chơi khác cần thấy. */
export const PlayerState = schema(
    {
        playerId: t.string(),
        name: t.string(),
        level: t.uint16(),
        /** Toạ độ theo đơn vị tile. */
        x: t.float32(),
        y: t.float32(),
        direction: t.string(),
        moving: t.boolean(),
        hp: t.uint32(),
        maxHp: t.uint32(),
    },
    "PlayerState"
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
    {
        mapCode: t.string(),
        /** Key = `client.sessionId`. */
        players: t.map(PlayerState),
    },
    "WorldState"
);
export type WorldState = SchemaType<typeof WorldState>;
