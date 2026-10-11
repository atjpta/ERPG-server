import { createHash } from "node:crypto";
import { MapLayoutSchema, type MapLayout } from "@/modules/maps/schemas/map-layout.schema.js";

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

export const hashMapLayout = (layout: MapLayout): string =>
    createHash("sha1")
        .update(JSON.stringify(canonicalize(layout)))
        .digest("hex");

export const parseMapLayout = (raw: unknown): MapLayout => MapLayoutSchema.parse(raw);

/** Điểm hồi sinh của map: spawn `respawn` đầu tiên, không có thì spawn mặc định. */
export const respawnPointOf = (map: {
    spawnX: number;
    spawnY: number;
    spawnPoints: readonly { x: number; y: number; kind: string }[];
}): { x: number; y: number } =>
    map.spawnPoints.find((p) => p.kind === "respawn") ?? { x: map.spawnX, y: map.spawnY };
