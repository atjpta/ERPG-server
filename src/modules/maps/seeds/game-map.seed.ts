import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import {
    GameMaps,
    type MonsterSpawn,
    type NewGameMap,
} from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

/**
 * Tạm: đủ mọi loại monster để thử, đặt quanh điểm spawn của player `(x, y)` (tile, y hướng xuống):
 * orc phía tây bắc, skeleton phía đông, shapeshifter phía nam — boss xa nhất.
 */
const testMonsterSpawns = (x: number, y: number): MonsterSpawn[] =>
    (
        [
            // ---- Orc
            { monsterCode: "orc", count: 2, at: [-8, -6] },
            { monsterCode: "armored_orc", count: 1, at: [-4, -9] },
            {
                monsterCode: "elite_orc",
                count: 1,
                type: MonsterType.ELITE,
                rarity: ItemRarity.GOOD,
                at: [-11, -10],
            },
            {
                monsterCode: "orc_rider",
                count: 1,
                type: MonsterType.BOSS,
                rarity: ItemRarity.EPIC,
                at: [-14, -14],
            },
            // ---- Skeleton
            { monsterCode: "skeleton", count: 1, at: [8, -4] },
            { monsterCode: "skeleton_archer", count: 1, at: [11, -1] },
            {
                monsterCode: "armored_skeleton",
                count: 1,
                type: MonsterType.ELITE,
                rarity: ItemRarity.RARE,
                at: [12, 4],
            },
            { monsterCode: "greatsword_skeleton", count: 1, at: [8, 6] },
            {
                monsterCode: "necromancer",
                count: 1,
                type: MonsterType.BOSS,
                rarity: ItemRarity.LEGENDARY,
                at: [16, 0],
            },
            // ---- ShapeShifter
            { monsterCode: "bat", count: 1, at: [-6, 8] },
            { monsterCode: "slime", count: 1, at: [-2, 10] },
            { monsterCode: "lancer", count: 1, at: [2, 10] },
            {
                monsterCode: "werebear",
                count: 1,
                type: MonsterType.ELITE,
                rarity: ItemRarity.RARE,
                at: [6, 12],
            },
            {
                monsterCode: "werewolf",
                count: 1,
                type: MonsterType.BOSS,
                rarity: ItemRarity.LEGENDARY,
                at: [0, 16],
            },
        ] satisfies (Omit<MonsterSpawn, "spawnX" | "spawnY"> & { at: [number, number] })[]
    ).map(({ at: [dx, dy], ...spawn }) => ({ ...spawn, spawnX: x + dx, spawnY: y + dy }));

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
        monsterSpawns: testMonsterSpawns(32, 32),
    },
    {
        code: "field_01",
        name: "Đồng Cỏ Slime",
        type: MapType.FIELD,
        width: 128,
        height: 96,
        spawnX: 64,
        spawnY: 48,
        monsterSpawns: testMonsterSpawns(64, 48),
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
