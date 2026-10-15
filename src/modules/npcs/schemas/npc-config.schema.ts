import { z } from "zod";

export const NpcRuleSchema = z.object({
    /** How close (tiles) a player must stand to talk to the NPC. */
    interactRadius: z.number().positive(),
});

export type NpcRule = z.infer<typeof NpcRuleSchema>;

/**
 * NPC numbers authored in Unity (Ranges tab of the Authoring Hub, `data/npc_config.json`): a base in `default`, and for an NPC that
 * needs another value only that number under `npcs`.
 */
export const NpcConfigSchema = z.object({
    default: NpcRuleSchema,
    npcs: z.record(z.string(), NpcRuleSchema.partial()).default({}),
});

export type NpcConfig = z.infer<typeof NpcConfigSchema>;

/** The rule of one NPC: its own numbers over the default. */
export const resolveNpcRule = (config: NpcConfig, npcCode: string): NpcRule => ({
    ...config.default,
    ...config.npcs[npcCode],
});

export const DEFAULT_NPC_CONFIG: NpcConfig = { default: { interactRadius: 2 }, npcs: {} };
