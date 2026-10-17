import { Command } from "@colyseus/command";

import { npcService } from "@/modules/npcs/services/npc.service.js";
import { NpcWorldState } from "@/rooms/world/schema/npc.world.state.js";
import { interactWorldService } from "@/rooms/world/content/services/interact.world.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { partyDirectoryService } from "@/modules/party/services/party-directory.service.js";
import { dialogueWorldService } from "@/rooms/world/content/services/dialogue.world.service.js";
import { dungeonWorldService } from "@/rooms/world/dungeons/services/dungeon.world.service.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { monsterWorldService } from "@/rooms/world/monsters/services/monster.world.service.js";
import { playerWorldService } from "@/rooms/world/players/services/player.world.service.js";
import { skillDeliveryWorldService } from "@/rooms/world/combat/services/skill-delivery.world.service.js";
import {
    PARTY_HEARTBEAT_MS,
    PARTY_REPORT_MS,
    partyWorldService,
} from "@/rooms/world/party/services/party.world.service.js";
import { worldService } from "@/rooms/world/core/services/world.service.js";

export interface WorldRoomOptions {
    mapCode: string;
    /** Chỉ room `dungeon`: id instance server cấp lúc vào dungeon. */
    instanceId?: string;
}

const CHECKPOINT_INTERVAL_MS = 30_000;

export class OnCreateWorldCommand extends Command<WorldRoom, WorldRoomOptions> {
    async execute({ mapCode, instanceId }: WorldRoomOptions) {
        const loaded = await mapService.getActiveByCodeOrFail(mapCode);
        // Dungeon chỉ mở qua room `dungeon` (có instanceId), map thường không được mở bằng instanceId.
        if ((loaded.type === MapType.DUNGEON) !== (instanceId !== undefined)) {
            throw new Error(`Map "${mapCode}" cannot be opened this way`);
        }
        // NPC không chặn đường: người chơi đi xuyên qua, chỉ collider của map mới là vật cản.
        const map = loaded;
        this.room.map = map;
        // Dungeon chứa tối đa bằng một party (cài đặt `party_config.maxMembers`); map thường theo map.
        this.room.maxClients =
            instanceId !== undefined
                ? masterDataCacheService.get(MasterDataKey.PARTY_CONFIG).maxMembers
                : map.maxPlayersPerChannel;
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
        if (instanceId !== undefined) {
            const expectation = await partyDirectoryService.getDungeonExpectation(instanceId);
            dungeonWorldService.setup(
                this.room,
                instanceId,
                expectation?.expected ?? [],
                expectation?.leaderPlayerId ?? ""
            );
        }

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
            dungeonWorldService.tick(this.room);
            dialogueWorldService.tick(this.room);
        }, this.room.tickRate);
        this.room.clock.setInterval((): void => {
            void worldService.checkpointPlayers(this.room);
        }, CHECKPOINT_INTERVAL_MS);
        this.room.clock.setInterval((): void => {
            void partyWorldService.heartbeat(this.room);
        }, PARTY_HEARTBEAT_MS);
        this.room.clock.setInterval((): void => {
            partyWorldService.report(this.room);
        }, PARTY_REPORT_MS);
    }
}
