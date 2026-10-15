import { z } from "zod";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

const nonNegative = z.number().nonnegative();

/** What a monster drops when it dies (before the loot of the map and the scale of its type / rarity). */
export const MonsterDropsFileSchema = z.object({
    /** Leave out for no gold. */
    gold: z.object({ min: nonNegative, max: nonNegative }).optional(),
    exp: nonNegative,
    items: z
        .array(
            z.object({
                itemCode: z.string().min(1),
                min: z.number().int().positive(),
                max: z.number().int().positive(),
                rate: z.number().min(0).max(1),
            })
        )
        .default([]),
});

export type MonsterDropsFile = z.infer<typeof MonsterDropsFileSchema>;

/** Stats at level 1 by stat key; the level config makes them grow. Speed is not here: it comes from `monster_ai_config`. */
const StatsSchema = z.partialRecord(z.enum(StatKey), z.number());

/**
 * `data/<code>.monster.json`: a monster authored in Unity (Monster Lab). Everything but the code and the biome falls back to
 * `data/monster-defaults.json`: a number the monster lists replaces the default of that number only, `drops` replaces the
 * default drops as a whole.
 */
export const MonsterFileSchema = z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
    biome: z.enum(Biome),
    level: z.number().int().positive().optional(),
    attackCooldownMs: z.number().int().positive().optional(),
    stats: StatsSchema.default({}),
    drops: MonsterDropsFileSchema.optional(),
});

/** `data/monster-defaults.json`: the base of every monster. */
export const MonsterDefaultsSchema = z.object({
    level: z.number().int().positive(),
    attackCooldownMs: z.number().int().positive(),
    stats: StatsSchema,
    drops: MonsterDropsFileSchema,
});

export type MonsterFile = z.infer<typeof MonsterFileSchema>;
export type MonsterDefaults = z.infer<typeof MonsterDefaultsSchema>;

/** A monster with its own numbers over the defaults. */
export interface ResolvedMonster {
    code: string;
    biome: Biome;
    level: number;
    attackCooldownMs: number;
    stats: Record<string, number>;
    drops: MonsterDropsFile;
}

export const resolveMonster = (file: MonsterFile, defaults: MonsterDefaults): ResolvedMonster => ({
    code: file.code,
    biome: file.biome,
    level: file.level ?? defaults.level,
    attackCooldownMs: file.attackCooldownMs ?? defaults.attackCooldownMs,
    stats: { ...defaults.stats, ...file.stats } as Record<string, number>,
    drops: file.drops ?? defaults.drops,
});
