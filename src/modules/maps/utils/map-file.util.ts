import { createHash } from "node:crypto";
import { MapSpawnKind, type NewGameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapFileSchema, type MapFile } from "@/modules/maps/schemas/map-file.schema.js";

/** Chuẩn hoá khoá object theo thứ tự chữ cái để hash không phụ thuộc cách sắp xếp/format file JSON. */
const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, v]) => [key, canonicalize(v)])
        );
    }
    return value;
};

export const hashMapFile = (map: MapFile): string =>
    createHash("sha1")
        .update(JSON.stringify(canonicalize(map)))
        .digest("hex");

export const parseMapFile = (raw: unknown): MapFile => MapFileSchema.parse(raw);

/** Map file → row `game_maps` (không có `name` — tên hiển thị tra locale theo code). */
export const mapFileToRow = (map: MapFile): NewGameMap => {
    const spawn = map.spawnPoints.find((p) => p.kind === MapSpawnKind.DEFAULT)!;
    return {
        code: map.code,
        name: map.code,
        type: map.type,
        width: map.width,
        height: map.height,
        tileSize: map.tileSize,
        spawnX: spawn.x,
        spawnY: spawn.y,
        maxPlayersPerChannel: map.maxPlayersPerChannel,
        pvpEnabled: map.pvpEnabled,
        monsterSpawns: map.monsterSpawns,
        spawnPoints: map.spawnPoints,
        colliders: map.colliders,
        contentHash: hashMapFile(map),
    };
};
