import { readdirSync, readFileSync } from "node:fs";
import {
    MonsterDefaultsSchema,
    MonsterFileSchema,
    resolveMonster,
    type MonsterDefaults,
    type MonsterFile,
    type ResolvedMonster,
} from "@/modules/monsters/schemas/monster-file.schema.js";

const DATA_DIR = new URL("../data/", import.meta.url);
const DEFAULTS_FILE = "monster-defaults.json";

/** `data/monster-defaults.json` (Monster Lab): the base every monster starts from. */
export const loadMonsterDefaults = (): MonsterDefaults =>
    MonsterDefaultsSchema.parse(
        JSON.parse(readFileSync(new URL(DEFAULTS_FILE, DATA_DIR), "utf-8"))
    );

/** Every `data/*.monster.json`, validated; the file name must be the monster code. */
export const loadMonsterFiles = (): MonsterFile[] =>
    readdirSync(DATA_DIR)
        .filter((file) => file.endsWith(".monster.json"))
        .sort()
        .map((file) => {
            const monster = MonsterFileSchema.parse(
                JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf-8"))
            );
            if (`${monster.code}.monster.json` !== file) {
                throw new Error(
                    `[MonsterFile] ${file}: code "${monster.code}" does not match the file name`
                );
            }
            return monster;
        });

/** Every monster with the defaults under it. */
export const loadResolvedMonsters = (): ResolvedMonster[] => {
    const defaults = loadMonsterDefaults();
    return loadMonsterFiles().map((file) => resolveMonster(file, defaults));
};
