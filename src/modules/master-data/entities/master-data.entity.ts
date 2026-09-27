import { jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import type { MasterDataValue } from "@/modules/master-data/schemas/master-data-value.schema.js";

export const masterDataKeyEnum = pgEnum("master_data_key", MasterDataKey);

export const MasterDatas = pgTable("master_data", {
    ...baseColumns(),
    key: masterDataKeyEnum("key").notNull().unique(),
    value: jsonb("value").$type<MasterDataValue>().notNull(),
    note: text("note").notNull().default(""),
});

export type MasterData = typeof MasterDatas.$inferSelect;
export type NewMasterData = typeof MasterDatas.$inferInsert;
