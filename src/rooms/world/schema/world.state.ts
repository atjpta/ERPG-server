import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

import { AreaWorldState } from "@/rooms/world/schema/area.world.state.js";
import { AuraWorldState } from "@/rooms/world/schema/aura.world.state.js";
import { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { DungeonWorldState } from "@/rooms/world/schema/dungeon.world.state.js";
import { InteractableWorldState } from "@/rooms/world/schema/interactable.world.state.js";
import { NpcWorldState } from "@/rooms/world/schema/npc.world.state.js";
import { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { ProjectileWorldState } from "@/rooms/world/schema/projectile.world.state.js";

export class WorldState extends Schema {
    @type("string") mapCode: string;
    @type("uint16") mapWidth: number;
    @type("uint16") mapHeight: number;
    @type({ map: PlayerWorldState }) players = new MapSchema<PlayerWorldState>();
    @type([MonsterWorldState]) monsters = new ArraySchema<MonsterWorldState>();
    @type([NpcWorldState]) npcs = new ArraySchema<NpcWorldState>();
    @type([InteractableWorldState]) interactables = new ArraySchema<InteractableWorldState>();
    /** Đạn đang bay, theo id. */
    @type({ map: ProjectileWorldState }) projectiles = new MapSchema<ProjectileWorldState>();
    /** Vùng sát thương chờ nổ, theo id. */
    @type({ map: AreaWorldState }) areas = new MapSchema<AreaWorldState>();
    /** Vùng buff đang tồn tại (skill AURA), theo id. */
    @type({ map: AuraWorldState }) auras = new MapSchema<AuraWorldState>();
    /** Chỉ có ở room dungeon. */
    @type(DungeonWorldState) dungeon?: DungeonWorldState;
}
