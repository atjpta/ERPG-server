import { z } from "zod";

/** Chức năng UI của NPC — client mở màn hình tương ứng khi nhận `npcFunctionOpen`. */
export enum NpcFunctionType {
    SHOP = "shop",
    STORAGE = "storage",
    ENHANCE = "enhance",
    REFINE = "refine",
    DISASSEMBLE = "disassemble",
    QUEST_BOARD = "quest_board",
}

export const NpcFunctionSchema = z.object({
    /** Id trong NPC — action `open_function` tham chiếu id này. */
    id: z.string().regex(/^[a-z0-9_]+$/),
    type: z.enum(NpcFunctionType),
    /** Tham số riêng của chức năng (vd mã shop) — gửi nguyên cho client. */
    config: z.record(z.string(), z.unknown()).default({}),
});
export type NpcFunction = z.infer<typeof NpcFunctionSchema>;
