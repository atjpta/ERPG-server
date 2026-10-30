import { z } from "zod";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";
import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";

/*
 * Schema `data` của endpoint `/user/maps*` — nguồn để `yarn unity:network` sinh class C#.
 * Toạ độ theo đơn vị TILE (float).
 */

/** `GET /user/maps`: metadata các map đang hoạt động (không kèm layout, xem `UserMapContentResponse`). */
export const UserMapSummaryResponse = z.object({
    code: z.string(),
    name: z.string(),
    type: z.enum(MapType),
    status: z.enum(MapStatus),
    width: z.number().int(),
    height: z.number().int(),
    tileSize: z.number().int(),
    maxPlayersPerChannel: z.number().int(),
    pvpEnabled: z.boolean(),
    minLevel: z.number().int(),
});

export const UserMapRectResponse = z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
});

/** `GET /user/maps/:code/content`: layout để client đối chiếu scene Unity và dựng minimap. */
export const UserMapContentResponse = z.object({
    code: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    tileSize: z.number().int(),
    minLevel: z.number().int(),
    /** So với hash file `<code>.map.json` trong build để phát hiện lệch. */
    contentHash: z.string(),
    spawnPoints: z.array(
        z.object({ id: z.string(), x: z.number(), y: z.number(), kind: z.string() })
    ),
    colliders: z.array(UserMapRectResponse),
    /** Dungeon: diện mạo cổng chắn (prefab); rỗng nếu không phải dungeon. */
    gateCode: z.string(),
    /** Dungeon: cổng chắn của từng chamber. */
    chambers: z.array(
        z.object({
            id: z.string(),
            entryGate: UserMapRectResponse.optional(),
            exitGate: UserMapRectResponse.optional(),
        })
    ),
    /** Monster có thể xuất hiện — client tải trước prefab. */
    monsterCodes: z.array(z.string()),
    /** NPC và vật thể (cổng, bệ teleport, bảng thông báo...) đặt trong map. */
    npcs: z.array(
        z.object({
            /** Id slot: gửi `interactNpc { id }`; duy nhất trong mọi map. */
            id: z.string(),
            npcCode: z.string(),
            kind: z.enum(NpcKind),
            /** Bấm vào là chạy chức năng ngay, không mở thoại (cổng, bệ teleport). */
            autoOpen: z.boolean(),
            x: z.number(),
            y: z.number(),
            /** NPC nhìn trái / phải; cổng chỉ hướng mũi tên. */
            direction: z.enum(["up", "down", "left", "right"]),
            interactRadius: z.number(),
            /** Chỉ cổng (chức năng `portal`). */
            targetMapCode: z.string().optional(),
            targetSpawnId: z.string().optional(),
        })
    ),
});
