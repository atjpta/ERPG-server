import { z } from "zod";
import { RewardSpecSchema } from "@/modules/rewards/schemas/reward-spec.schema.js";

/**
 * Chức năng của NPC (kể cả vật thể). Loại UI (shop, storage, enhance...) thì client mở màn hình khi nhận `npcFunctionOpen`;
 * loại hành động trong map (portal, teleport, gather) thì server chạy luôn khi người chơi bấm vào (xem `NpcFunctionWorldService`).
 */
export enum NpcFunctionType {
    SHOP = "shop",
    STORAGE = "storage",
    ENHANCE = "enhance",
    REFINE = "refine",
    DISASSEMBLE = "disassemble",
    QUEST_BOARD = "quest_board",
    /** Cổng dịch chuyển sang map khác (hoặc vào dungeon nếu đích là dungeon). */
    PORTAL = "portal",
    /** Bệ teleport: mở danh sách mọi map có bệ teleport. */
    TELEPORT = "teleport",
    /** Vật thể thu thập: nhặt quà rồi tạm biến mất. */
    GATHER = "gather",
}

/** Id trong NPC — action `open_function` tham chiếu id này. */
const idSchema = z.string().regex(/^[a-z0-9_]+$/);
const noConfig = z.object({}).default({});

/** Mỗi loại có đúng kiểu `config` của nó: gửi nguyên cho client (JSON) và đọc lại ở server. */
export const NpcFunctionSchema = z.discriminatedUnion("type", [
    z.object({
        id: idSchema,
        type: z.literal(NpcFunctionType.SHOP),
        config: z.object({ shop: z.string().min(1) }),
    }),
    z.object({ id: idSchema, type: z.literal(NpcFunctionType.STORAGE), config: noConfig }),
    z.object({ id: idSchema, type: z.literal(NpcFunctionType.ENHANCE), config: noConfig }),
    z.object({ id: idSchema, type: z.literal(NpcFunctionType.REFINE), config: noConfig }),
    z.object({ id: idSchema, type: z.literal(NpcFunctionType.DISASSEMBLE), config: noConfig }),
    z.object({ id: idSchema, type: z.literal(NpcFunctionType.QUEST_BOARD), config: noConfig }),
    z.object({
        id: idSchema,
        type: z.literal(NpcFunctionType.PORTAL),
        config: z.object({
            targetMapCode: z.string().min(1),
            targetSpawnId: idSchema,
        }),
    }),
    z.object({
        id: idSchema,
        type: z.literal(NpcFunctionType.TELEPORT),
        config: z
            .object({
                /** Ai cũng teleport tới map này được, không cần từng đến (ví dụ phòng tập). Vẫn kiểm `minLevel`. */
                openToAll: z.boolean().optional(),
            })
            .default({}),
    }),
    z.object({
        id: idSchema,
        type: z.literal(NpcFunctionType.GATHER),
        config: z.object({
            reward: RewardSpecSchema,
            respawnSec: z.number().int().positive(),
        }),
    }),
]);
export type NpcFunction = z.infer<typeof NpcFunctionSchema>;

/** Phần `config` của đúng loại `T` (vd `NpcFunctionOf<NpcFunctionType.PORTAL>["config"]`). */
export type NpcFunctionOf<T extends NpcFunctionType> = Extract<NpcFunction, { type: T }>;
