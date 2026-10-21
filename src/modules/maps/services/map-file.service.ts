import { createHash } from "node:crypto";
import { MapLayoutSchema, type MapLayout } from "@/modules/maps/schemas/map-layout.schema.js";

export class MapFileService {
    /** Chuẩn hoá khoá object theo thứ tự chữ cái để hash không phụ thuộc cách sắp xếp/format file JSON. */
    private canonicalize(value: unknown): unknown {
        if (Array.isArray(value)) return value.map((item) => this.canonicalize(item));
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>)
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                    .map(([key, v]) => [key, this.canonicalize(v)])
            );
        }
        return value;
    }

    hashMapLayout(layout: MapLayout): string {
        return createHash("sha1")
            .update(JSON.stringify(this.canonicalize(layout)))
            .digest("hex");
    }

    parseMapLayout(raw: unknown): MapLayout {
        return MapLayoutSchema.parse(raw);
    }

    /** Điểm hồi sinh của map: spawn `respawn` đầu tiên, không có thì spawn mặc định. */
    respawnPointOf(map: {
        spawnX: number;
        spawnY: number;
        spawnPoints: readonly { x: number; y: number; kind: string }[];
    }): { x: number; y: number } {
        return (
            map.spawnPoints.find((p) => p.kind === "respawn") ?? { x: map.spawnX, y: map.spawnY }
        );
    }
}

export const mapFileService = new MapFileService();
