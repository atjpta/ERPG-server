import { Command } from "@colyseus/command";

import { mapService } from "@/modules/maps/user/services/map.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { monsterWorldService } from "@/rooms/world/services/monster.world.service.js";
import { playerWorldService } from "@/rooms/world/services/player.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";

export interface WorldRoomOptions {
    mapCode: string;
}

const CHECKPOINT_INTERVAL_MS = 30_000;

export class OnCreateWorldCommand extends Command<WorldRoom, WorldRoomOptions> {
    async execute({ mapCode }: WorldRoomOptions) {
        const map = await mapService.getActiveByCodeOrFail(mapCode);
        this.room.map = map;
        this.room.maxClients = map.maxPlayersPerChannel;
        this.room.state.mapCode = map.code;
        this.room.state.mapWidth = map.width;
        this.room.state.mapHeight = map.height;

        const monsters = await monsterWorldService.createMonster(map);

        this.room.state.monsters.push(...monsters);

        this.room.setFixedTimestep((ctx) => {
            playerWorldService.chain(this.room, ctx);
            monsterWorldService.chain(this.room, ctx.dt);
        }, this.room.tickRate);
        this.room.clock.setInterval((): void => {
            void worldService.checkpointPlayers(this.room);
        }, CHECKPOINT_INTERVAL_MS);
    }
}
