import { readdirSync, readFileSync } from "node:fs";
import { GameMaps, type NewGameMap } from "@/modules/maps/entities/game-map.entity.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import {
    MapDefinitionSchema,
    type MapDefinition,
} from "@/modules/maps/schemas/map-definition.schema.js";
import type { MapLayout } from "@/modules/maps/schemas/map-layout.schema.js";
import {
    buildMapRow,
    buildPlaceholderRow,
    validateDefinitionRefs,
    validateLayoutAgainstDefinition,
} from "@/modules/maps/seeds/map-build.seed-util.js";
import { hashMapLayout, parseMapLayout } from "@/modules/maps/services/map-file.service.js";

const DATA_DIR = new URL("../data/", import.meta.url);

/** Đọc mọi `data/*.map.json` (file do Unity export, chỉ vị trí) — thêm layout = thêm 1 file, không sửa code. */
export const loadMapLayouts = (): MapLayout[] =>
    readdirSync(DATA_DIR)
        .filter((file) => file.endsWith(".map.json"))
        .sort()
        .map((file) => {
            const layout = parseMapLayout(
                JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf-8"))
            );
            if (`${layout.code}.map.json` !== file) {
                throw new Error(`[GameMapSeed] ${file}: code "${layout.code}" không khớp tên file`);
            }
            return layout;
        });

const DEFINITIONS_DIR = new URL("../data/definitions/", import.meta.url);

/** Mọi `definitions/<code>.json` (mỗi map một file, do Map Lab của Unity ghi ra), đã kiểm schema. */
export const loadMapDefinitionFiles = (): MapDefinition[] =>
    readdirSync(DEFINITIONS_DIR)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => {
            const definition = MapDefinitionSchema.parse(
                JSON.parse(readFileSync(new URL(file, DEFINITIONS_DIR), "utf-8"))
            );
            if (`${definition.code}.json` !== file) {
                throw new Error(
                    `[GameMapSeed] definitions/${file}: code "${definition.code}" không khớp tên file`
                );
            }
            return definition;
        });

/** Định nghĩa (config) của mọi map — mỗi map một file `definitions/<code>.json` do Map Lab của Unity ghi ra — đã kiểm tham chiếu chéo giữa các map. */
export const loadMapDefinitions = (): MapDefinition[] => {
    const all = loadMapDefinitionFiles();
    const errors = validateDefinitionRefs(all);
    if (errors.length > 0) throw new Error(`[GameMapSeed] ${errors.join("; ")}`);
    return all;
};

/** Định nghĩa chưa có file layout từ Unity (sẽ thành row placeholder). */
export const definitionsWithoutLayout = (layouts: readonly MapLayout[] = loadMapLayouts()) =>
    loadMapDefinitions().filter((def) => !layouts.some((layout) => layout.code === def.code));

/** Ghép định nghĩa + layout thành row `game_maps`; layout không khớp định nghĩa thì ném lỗi. */
export const buildAllMapRows = (): NewGameMap[] => {
    const definitions = loadMapDefinitions();
    const layouts = loadMapLayouts();
    const errors: string[] = [];
    for (const layout of layouts) {
        if (!definitions.some((def) => def.code === layout.code)) {
            errors.push(
                `${layout.code}.map.json: chưa có định nghĩa map (definitions/<code>.json, tạo bằng Map Lab)`
            );
        }
    }
    const rows = definitions.map((def) => {
        const layout = layouts.find((item) => item.code === def.code);
        if (!layout) return buildPlaceholderRow(def);
        const layoutErrors = validateLayoutAgainstDefinition(def, layout);
        if (layoutErrors.length > 0) {
            errors.push(...layoutErrors);
            return buildPlaceholderRow(def);
        }
        return buildMapRow(def, layout, hashMapLayout(layout)).row;
    });
    if (errors.length > 0) throw new Error(`[GameMapSeed] ${errors.join("; ")}`);
    return rows;
};

export const GameMapSeed = async () => {
    const rows = buildAllMapRows();
    for (const row of rows) {
        await GameMapRepo.upsert({
            data: row,
            target: GameMaps.code,
            matchValue: row.code,
            updateData: row,
        });
    }
    console.info("✅ [GameMapSeed] Done");
    warnMapLayouts(
        rows.map((row) => ({
            code: row.code,
            layoutReady: row.layoutReady ?? true,
            missingMarkers: row.missingMarkers ?? [],
        }))
    );
};

export interface MapLayoutStatus {
    code: string;
    layoutReady: boolean;
    missingMarkers: string[];
}

/** Cảnh báo map thiếu file Unity hoặc thiếu vị trí marker (seed + khởi động server dùng chung). */
export const warnMapLayouts = (maps: readonly MapLayoutStatus[]) => {
    const noFile = maps.filter((map) => !map.layoutReady).map((map) => map.code);
    if (noFile.length > 0) {
        console.warn(
            `⚠️  [maps] chưa có data Unity (data/<code>.map.json), cần cập nhật thêm: ${noFile.join(", ")}`
        );
    }
    for (const map of maps) {
        if (map.layoutReady && map.missingMarkers.length > 0) {
            console.warn(
                `⚠️  [maps] ${map.code}: Unity chưa đặt vị trí marker: ${map.missingMarkers.join(", ")}`
            );
        }
    }
};
