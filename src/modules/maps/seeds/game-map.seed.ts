import { readdirSync, readFileSync } from "node:fs";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import {
    mapFileToRow,
    parseMapFile,
    validateMapFileRefs,
} from "@/modules/maps/utils/map-file.util.js";

const DATA_DIR = new URL("../data/", import.meta.url);

/** Đọc mọi `data/*.map.json` (file do Unity export) — thêm map mới = thêm 1 file, không sửa code. */
export const loadMapFiles = () => {
    const maps = readMapFiles();
    const errors = validateMapFileRefs(maps);
    if (errors.length > 0) throw new Error(`[GameMapSeed] ${errors.join("; ")}`);
    return maps;
};

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
    for (const file of loadMapFiles()) {
        const row = mapFileToRow(file);
        await GameMapRepo.upsert({
            data: row,
            target: GameMaps.code,
            matchValue: row.code,
            updateData: row,
        });
    }
    console.info("✅ [GameMapSeed] Done");
};
