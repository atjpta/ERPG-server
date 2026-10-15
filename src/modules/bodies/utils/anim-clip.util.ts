import { readFileSync } from "node:fs";
import { AnimClipsSchema, type AnimClips } from "@/modules/bodies/schemas/anim-clips.schema.js";

const FILE = new URL("../data/anim-clips.json", import.meta.url);

/** Skills can end this much before their animation does without a warning (the seed rounds to 50 ms ticks). */
export const CLIP_TOLERANCE_MS = 10;

let cached: AnimClips | undefined;

/** Clip lengths exported from Unity; a missing or malformed file is an error (run Tools/ERPG/Sync Server). */
export const loadAnimClips = (): AnimClips => {
    cached ??= AnimClipsSchema.parse(JSON.parse(readFileSync(FILE, "utf-8")));
    return cached;
};

/** Length of a monster's attack animation, so its attack lasts exactly as long as it plays. */
export const monsterAttackMs = (code: string): number => {
    const clip = loadAnimClips().monsters[code];
    if (!clip)
        throw new Error(`[AnimClips] No Attack1 clip for monster "${code}": sync it from Unity`);
    return clip.attackMs;
};

interface TimedSkill {
    code: string;
    animationMs: number;
    castTimeMs: number;
    skillHitEvents: { triggerTicks: number }[];
}

/** 20 ticks a second while the seed is authored (50 ms a tick). */
const AUTHORED_TICK_MS = 50;

/**
 * Warnings for class skills that do not fit their animation: it lasts longer than the clip (the animation would end while the
 * character is still locked), or a hit lands after the clip is over. A skill shorter than its clip is fine: that is tuning.
 */
export const skillClipWarnings = (
    skills: readonly TimedSkill[],
    clips: AnimClips = loadAnimClips()
): string[] => {
    const warnings: string[] = [];
    for (const skill of skills) {
        const clip = clips.skills[skill.code];
        if (!clip) continue;
        if (skill.animationMs > clip.lengthMs + CLIP_TOLERANCE_MS) {
            warnings.push(
                `${skill.code}: animationMs ${skill.animationMs} is longer than its clip (${clip.lengthMs} ms)`
            );
        }
        const lastHitMs = Math.max(
            0,
            ...skill.skillHitEvents.map((e) => e.triggerTicks * AUTHORED_TICK_MS)
        );
        if (lastHitMs > clip.lengthMs + CLIP_TOLERANCE_MS) {
            warnings.push(
                `${skill.code}: its last hit (${lastHitMs} ms) lands after its clip ends (${clip.lengthMs} ms)`
            );
        }
    }
    return warnings;
};
