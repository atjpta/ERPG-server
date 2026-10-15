import { z } from "zod";

/**
 * `anim-clips.json`, exported from the Unity prefabs' Animators: how long the attack animations are.
 * `skills` = class skill clips by skill code; `monsters` = the `Attack1` clip of each monster by code.
 */
export const AnimClipsSchema = z.object({
    skills: z.record(z.string(), z.object({ lengthMs: z.number().int().positive() })),
    monsters: z.record(z.string(), z.object({ attackMs: z.number().int().positive() })),
});

export type AnimClips = z.infer<typeof AnimClipsSchema>;
