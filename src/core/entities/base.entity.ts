import { text, timestamp, uuid } from "drizzle-orm/pg-core";
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

export const baseWithCodeColumns = () => ({
    ...baseColumns(),
    code: text("code").notNull().unique(),
});
