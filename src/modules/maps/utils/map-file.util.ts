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
        npcs: map.npcs,
        interactables: map.interactables,
        contentHash: hashMapFile(map),
    };
};

/** Tham chiếu chéo giữa các file map (portal trỏ tới map/spawn có thật); trả danh sách lỗi. */
export const validateMapFileRefs = (maps: readonly MapFile[]): string[] => {
    const errors: string[] = [];
    const byCode = new Map(maps.map((map) => [map.code, map]));
    for (const map of maps) {
        for (const it of map.interactables) {
            if (it.type !== "portal") continue;
            const target = byCode.get(it.targetMapCode);
            if (!target) {
                errors.push(`${map.code}.${it.id}: unknown map "${it.targetMapCode}"`);
            } else if (!target.spawnPoints.some((p) => p.id === it.targetSpawnId)) {
                errors.push(
                    `${map.code}.${it.id}: unknown spawn "${it.targetMapCode}.${it.targetSpawnId}"`
                );
            }
        }
    }
    return errors;
};

/** Điểm hồi sinh của map: spawn `respawn` đầu tiên, không có thì spawn mặc định. */
export const respawnPointOf = (map: {
    spawnX: number;
    spawnY: number;
    spawnPoints: readonly { x: number; y: number; kind: string }[];
}): { x: number; y: number } =>
    map.spawnPoints.find((p) => p.kind === "respawn") ?? { x: map.spawnX, y: map.spawnY };
