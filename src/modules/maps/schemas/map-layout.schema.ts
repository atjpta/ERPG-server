import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9_]+$/);
/** Toạ độ tile, gốc ở giữa map nên có thể âm; có nằm trong map hay không do `superRefine` bên dưới kiểm. */
const tile = z.number();
const point = { x: tile, y: tile };

const PositionedSchema = z.object({ id: idSchema, ...point });
/** Vật thể tương tác: vị trí + hướng mũi tên của portal (Unity chọn ở marker; bỏ trống = client tự suy ra). */
const InteractablePlacementSchema = PositionedSchema.extend({
    direction: z.enum(["up", "down", "left", "right"]).optional(),
});
const GateRectSchema = z.object({ ...point, w: z.number().positive(), h: z.number().positive() });
/** NPC: vị trí + hướng nhìn — hướng do Unity chọn ở marker slot, không nằm trong định nghĩa. */
const NpcPlacementSchema = PositionedSchema.extend({
    direction: z.enum(["left", "right"]).default("right"),
});

/**
 * File `<mapCode>.map.json` do Unity export — **chỉ vị trí và hình học**: kích thước map, vị trí các marker
 * (spawn point, nhóm quái, NPC, vật thể tương tác), collider, hình học chamber của dungeon. Loại map, level,
 * quái nào ở marker nào, portal đi đâu... là config phía server (`map-definition.schema.ts`); danh sách marker
 * cần đặt do server xuất ra `map-markers.json` (`yarn config:export`).
 * Toạ độ theo tile, gốc ở giữa map, y hướng lên (như Unity). Hình chữ nhật neo ở góc nhỏ nhất (dưới-trái).
 */
export const MapLayoutSchema = z
    .object({
        code: z.string().regex(/^[a-z0-9_-]+$/),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        tileSize: z.number().int().positive().default(16),
        spawnPoints: z.array(PositionedSchema).default([]),
        colliders: z
            .array(z.object({ ...point, w: z.number().positive(), h: z.number().positive() }))
            .default([]),
        /** Vị trí marker nhóm quái (id = `markerId` của nhóm trong định nghĩa). */
        monsters: z.array(PositionedSchema).default([]),
        /** Vị trí và hướng nhìn của slot NPC (id = id slot trong định nghĩa). */
        npcs: z.array(NpcPlacementSchema).default([]),
        interactables: z.array(InteractablePlacementSchema).default([]),
        /** Dungeon: hình học từng chamber. */
        chambers: z
            .array(
                z.object({
                    id: idSchema,
                    bounds: z.object({
                        ...point,
                        w: z.number().positive(),
                        h: z.number().positive(),
                    }),
                    /** Chamber đầu không cần: người chơi vào ở spawn `default` của dungeon. */
                    entry: z.object(point).optional(),
                    /** Cổng chắn phía sau chỗ vào / phía trước lối ra: khoá (chặn đường) tới khi dọn hết quái. */
                    entryGate: GateRectSchema.optional(),
                    exitGate: GateRectSchema.optional(),
                    exit: z.object(point).optional(),
                })
            )
            .default([]),
    })
    .superRefine((map, ctx) => {
        // Làm tròn float khi Unity export (vd 7.43 - 18) nên chừa sai số nhỏ.
        const tolerance = 1e-6;
        const halfW = map.width / 2 + tolerance;
        const halfH = map.height / 2 + tolerance;
        const outside = (x: number, y: number) => Math.abs(x) > halfW || Math.abs(y) > halfH;
        const rectOutside = (r: { x: number; y: number; w: number; h: number }) =>
            r.x < -halfW || r.y < -halfH || r.x + r.w > halfW || r.y + r.h > halfH;
        const check = (name: string, items: { id: string; x: number; y: number }[]) => {
            const ids = new Set<string>();
            items.forEach((item, i) => {
                if (ids.has(item.id)) {
                    ctx.addIssue({
                        code: "custom",
                        path: [name, i, "id"],
                        message: "duplicate id",
                    });
                }
                ids.add(item.id);
                if (outside(item.x, item.y)) {
                    ctx.addIssue({ code: "custom", path: [name, i], message: "outside map" });
                }
            });
        };
        check("spawnPoints", map.spawnPoints);
        check("monsters", map.monsters);
        check("npcs", map.npcs);
        check("interactables", map.interactables);
        map.colliders.forEach((c, i) => {
            if (rectOutside(c)) {
                ctx.addIssue({ code: "custom", path: ["colliders", i], message: "outside map" });
            }
        });
        const chamberIds = new Set<string>();
        map.chambers.forEach((chamber, i) => {
            if (chamberIds.has(chamber.id)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["chambers", i, "id"],
                    message: "duplicate id",
                });
            }
            chamberIds.add(chamber.id);
            if (rectOutside(chamber.bounds)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["chambers", i, "bounds"],
                    message: "outside map",
                });
            }
        });
    });

export type MapLayout = z.infer<typeof MapLayoutSchema>;
