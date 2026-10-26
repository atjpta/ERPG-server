import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

import { AreaWorldState } from "@/modules/combat/state/area.state.js";
import { AuraWorldState } from "@/modules/combat/state/aura.state.js";
import { MonsterWorldState } from "@/modules/monsters/state/monster.state.js";
import { DungeonWorldState } from "@/modules/maps/state/dungeon.state.js";
import { NpcWorldState } from "@/modules/npcs/state/npc.state.js";
import { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { ProjectileWorldState } from "@/modules/combat/state/projectile.state.js";

export class WorldState extends Schema {
    @type("string") mapCode: string;
    @type("uint16") mapWidth: number;
    @type("uint16") mapHeight: number;
    @type({ map: PlayerWorldState }) players = new MapSchema<PlayerWorldState>();
    @type([MonsterWorldState]) monsters = new ArraySchema<MonsterWorldState>();
    @type([NpcWorldState]) npcs = new ArraySchema<NpcWorldState>();
    /** Đạn đang bay, theo id. */
    @type({ map: ProjectileWorldState }) projectiles = new MapSchema<ProjectileWorldState>();
    /** Vùng sát thương chờ nổ, theo id. */
    @type({ map: AreaWorldState }) areas = new MapSchema<AreaWorldState>();
    /** Vùng buff đang tồn tại (skill AURA), theo id. */
    @type({ map: AuraWorldState }) auras = new MapSchema<AuraWorldState>();
    /** Chỉ có ở room dungeon. */
    @type(DungeonWorldState) dungeon?: DungeonWorldState;
}
