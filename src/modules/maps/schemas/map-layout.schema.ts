import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9_]+$/);
const tile = z.number().min(0);
const point = { x: tile, y: tile };

const PositionedSchema = z.object({ id: idSchema, ...point });

/**
 * File `<mapCode>.map.json` do Unity export — **chỉ vị trí và hình học**: kích thước map, vị trí các marker
 * (spawn point, nhóm quái, NPC, vật thể tương tác), collider, hình học chamber của dungeon. Loại map, level,
 * quái nào ở marker nào, portal đi đâu... là config phía server (`map-definition.schema.ts`); danh sách marker
 * cần đặt do server xuất ra `map-markers.json` (`yarn config:export`).
 * Toạ độ theo tile, gốc trên-trái, y hướng xuống.
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
        /** Vị trí slot NPC (id = id slot trong định nghĩa). */
        npcs: z.array(PositionedSchema).default([]),
        interactables: z.array(PositionedSchema).default([]),
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
                    entry: z.object(point),
                    exit: z.object(point).optional(),
                })
            )
            .default([]),
    })
    .superRefine((map, ctx) => {
        const outside = (x: number, y: number) => x > map.width || y > map.height;
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
            if (c.x + c.w > map.width || c.y + c.h > map.height) {
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
            if (
                chamber.bounds.x + chamber.bounds.w > map.width ||
                chamber.bounds.y + chamber.bounds.h > map.height
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["chambers", i, "bounds"],
                    message: "outside map",
                });
            }
        });
    });

export type MapLayout = z.infer<typeof MapLayoutSchema>;
