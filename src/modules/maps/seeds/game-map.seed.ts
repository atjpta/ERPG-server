import { GameMaps, type NewGameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";

const MAPS: NewGameMap[] = [
    {
        code: "town_01",
        name: "Làng Khởi Đầu",
        type: MapType.TOWN,
        width: 64,
        height: 64,
        // Tọa độ server: gốc ở góc trên-trái, y hướng xuống → giữa map = (width/2, height/2),
        // tức (0, 0) bên Unity.
        spawnX: 32,
        spawnY: 32,
        monsterSpawns: [{ monsterCode: "orc", count: 10 }],
    },
    {
        code: "field_01",
        name: "Đồng Cỏ Slime",
        type: MapType.FIELD,
        width: 128,
        height: 96,
        spawnX: 64,
        spawnY: 48,
        monsterSpawns: [
            { monsterCode: "orc", count: 6 },
            { monsterCode: "skeleton", count: 5 },
            { monsterCode: "shapeshifter", count: 4 },
        ],
    },
];

export const GameMapSeed = async () => {
    for (const map of MAPS) {
        await GameMapRepo.upsert({
            data: map,
            target: GameMaps.code,
            matchValue: map.code,
            updateData: map,
        });
    }
    console.info("✅ [GameMapSeed] Done");
};
