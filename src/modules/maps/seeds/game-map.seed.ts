import { readdirSync, readFileSync } from "node:fs";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { MAP_REGISTRY, type MapPlaceholder } from "@/modules/maps/seeds/map-registry.js";
import {
    mapFileToRow,
    parseMapFile,
    placeholderToRow,
    validateMapFileRefs,
} from "@/modules/maps/utils/map-file.util.js";

const DATA_DIR = new URL("../data/", import.meta.url);

/** Đọc mọi `data/*.map.json` (file do Unity export) — thêm map mới = thêm 1 file, không sửa code. */
export const loadMapFiles = () => {
    const maps = readMapFiles();
    const errors = validateMapFileRefs(maps, loadMapPlaceholders(maps.map((map) => map.code)));
    if (errors.length > 0) throw new Error(`[GameMapSeed] ${errors.join("; ")}`);
    return maps;
};

/** Map trong `MAP_REGISTRY` chưa có file Unity (`existingCodes` = code đã có file). */
export const loadMapPlaceholders = (
    existingCodes: readonly string[] = readMapFiles().map((map) => map.code)
): MapPlaceholder[] => MAP_REGISTRY.filter((map) => !existingCodes.includes(map.code));

const readMapFiles = () =>
    readdirSync(DATA_DIR)
        .filter((file) => file.endsWith(".map.json"))
        .sort()
        .map((file) => {
            const map = parseMapFile(JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf-8")));
            if (`${map.code}.map.json` !== file) {
                throw new Error(`[GameMapSeed] ${file}: code "${map.code}" không khớp tên file`);
            }
            return map;
        });

export const GameMapSeed = async () => {
    const files = loadMapFiles();
    const rows = [
        ...files.map(mapFileToRow),
        ...loadMapPlaceholders(files.map((map) => map.code)).map(placeholderToRow),
    ];
    for (const row of rows) {
        await GameMapRepo.upsert({
            data: row,
            target: GameMaps.code,
            matchValue: row.code,
            updateData: row,
        });
    }
    console.info("✅ [GameMapSeed] Done");
    warnMissingMapLayouts(rows.filter((row) => row.layoutReady === false).map((row) => row.code));
};

/** Cảnh báo map còn thiếu file Unity (seed + khởi động server dùng chung). */
export const warnMissingMapLayouts = (codes: readonly string[]) => {
    if (codes.length === 0) return;
    console.warn(
        `⚠️  [maps] chưa có data Unity (data/<code>.map.json), cần cập nhật thêm: ${codes.join(", ")}`
    );
};
