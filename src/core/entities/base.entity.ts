import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";
import { v7 as uuidv7 } from "uuid";

export const generateEntityId = () => uuidv7();

export const baseColumns = () => ({
    id: uuid("id").primaryKey().$defaultFn(generateEntityId),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => DateTime.now().toJSDate()),
});

export const baseWithCodeColumns = (codes: Record<string, string>) => ({
    ...baseColumns(),
    code: text("code", { enum: Object.values(codes) as [string, ...string[]] })
        .notNull()
        .unique(),
    enabled: boolean("enabled").notNull().default(true),
});
