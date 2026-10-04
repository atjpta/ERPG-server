import { bigint, integer, pgTable } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";

/** Bảng exp: `exp` = exp cần tích luỹ ở `level` để lên `level + 1` (player_states.exp tính trong level hiện tại). */
export const Levels = pgTable("levels", {
    ...baseColumns(),
    level: integer("level").notNull().unique(),
    exp: bigint("exp", { mode: "number" }).notNull(),
});

export type Level = typeof Levels.$inferSelect;
export type NewLevel = typeof Levels.$inferInsert;
