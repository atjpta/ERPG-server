import { Command } from "@colyseus/command";

import { npcService } from "@/modules/npcs/services/npc.service.js";
import { NpcWorldState } from "@/rooms/world/schema/npc.world.state.js";
import { interactWorldService } from "@/rooms/world/services/interact.world.service.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { monsterWorldService } from "@/rooms/world/services/monster.world.service.js";
import { playerWorldService } from "@/rooms/world/services/player.world.service.js";
import { skillDeliveryWorldService } from "@/rooms/world/services/skill-delivery.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";

export interface WorldRoomOptions {
    mapCode: string;
}

const CHECKPOINT_INTERVAL_MS = 30_000;

export class OnCreateWorldCommand extends Command<WorldRoom, WorldRoomOptions> {
    async execute({ mapCode }: WorldRoomOptions) {
        const loaded = await mapService.getActiveByCodeOrFail(mapCode);
        // NPC không chặn đường: người chơi đi xuyên qua, chỉ collider của map mới là vật cản.
        const map = loaded;
        this.room.map = map;
        this.room.maxClients = map.maxPlayersPerChannel;
        this.room.state.mapCode = map.code;
        this.room.state.mapWidth = map.width;
        this.room.state.mapHeight = map.height;
        this.room.patchRate = 25;

        this.room.state.npcs.push(
            ...map.npcs
                .filter((placement) => npcService.getByCode(placement.npcCode))
                .map(
                    (placement) =>
                        new NpcWorldState({
                            code: placement.npcCode,
                            x: placement.x,
                            y: placement.y,
                            direction: placement.direction,
                        })
                )
        );
        this.room.state.interactables.push(...interactWorldService.build(this.room));

        const monsters = await monsterWorldService.createMonster(map);

        this.room.state.monsters.push(...monsters);
        // Lag compensation: client vẽ monster trễ (lerp), nên hit của player được tính theo vị trí
        // monster mà chính client đó đang thấy lúc gửi input ("thấy trúng là trúng").
        this.room.rewind = this.room
            .allowRewindState({ maxRewindMs: 500 })
            .attachAll(this.room.state.monsters, { fields: ["x", "y"] });

        this.room.setFixedTimestep((ctx) => {
            playerWorldService.chain(this.room, ctx);
            monsterWorldService.chain(this.room, ctx.dt);
            // Đạn bay / vùng chờ nổ — sau player và monster để thấy vị trí mới nhất của tick này.
            skillDeliveryWorldService.chain(this.room, ctx.dt);
        }, this.room.tickRate);
        this.room.clock.setInterval((): void => {
            void worldService.checkpointPlayers(this.room);
        }, CHECKPOINT_INTERVAL_MS);
    }
}
