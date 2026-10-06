import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { GameMaps, type NewGameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

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
        // Tạm: đủ mọi loại để thử (client chưa chọn prefab theo code).
        monsterSpawns: [
            { monsterCode: "orc", count: 2 },
            { monsterCode: "armored_orc", count: 1 },
            {
                monsterCode: "elite_orc",
                count: 1,
                type: MonsterType.ELITE,
                rarity: ItemRarity.GOOD,
            },
            { monsterCode: "orc_rider", count: 1, type: MonsterType.BOSS, rarity: ItemRarity.EPIC },
            { monsterCode: "skeleton", count: 1 },
            { monsterCode: "skeleton_archer", count: 1 },
            {
                monsterCode: "armored_skeleton",
                count: 1,
                type: MonsterType.ELITE,
                rarity: ItemRarity.RARE,
            },
            { monsterCode: "greatsword_skeleton", count: 1 },
            {
                monsterCode: "necromancer",
                count: 1,
                type: MonsterType.BOSS,
                rarity: ItemRarity.LEGENDARY,
            },
            { monsterCode: "bat", count: 1 },
            { monsterCode: "slime", count: 1 },
            { monsterCode: "lancer", count: 1 },
            { monsterCode: "werebear", count: 1, type: MonsterType.ELITE, rarity: ItemRarity.RARE },
            {
                monsterCode: "werewolf",
                count: 1,
                type: MonsterType.BOSS,
                rarity: ItemRarity.LEGENDARY,
            },
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
