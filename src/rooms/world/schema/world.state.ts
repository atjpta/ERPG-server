import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

import { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";

export class WorldState extends Schema {
    @type("string") mapCode: string;
    @type("uint16") mapWidth: number;
    @type("uint16") mapHeight: number;
    @type({ map: PlayerWorldState }) players = new MapSchema<PlayerWorldState>();
    @type([MonsterWorldState]) monsters = new ArraySchema<MonsterWorldState>();
}
