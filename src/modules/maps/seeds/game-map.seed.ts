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
        spawnX: 32,
        spawnY: 32,
    },
    {
        code: "field_01",
        name: "Đồng Cỏ Slime",
        type: MapType.FIELD,
        width: 128,
        height: 96,
        spawnX: 4,
        spawnY: 48,
    },
];

export const GameMapSeed = async (force = false) => {
    for (const map of MAPS) {
        await GameMapRepo.upsert({
            data: map,
            target: GameMaps.code,
            matchValue: map.code,
            updateData: force ? map : undefined,
        });
    }
    console.info("✅ [GameMapSeed] Done");
};
