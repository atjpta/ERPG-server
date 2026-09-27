import { boolean, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";
import { Users } from "@/modules/auth/entities/user.entity.js";

export const clientPlatformEnum = pgEnum("client_platform", ClientPlatform);

export const UserSessions = pgTable(
    "user_sessions",
    {
        ...baseColumns(),
        userId: uuid("user_id")
            .notNull()
            .references(() => Users.id, { onDelete: "cascade" }),
        platform: clientPlatformEnum("platform").notNull(),
        clientVersion: text("client_version").notNull(),
        /** Nhãn thiết bị do client tự gửi lúc login (model máy, tên PC...) — chỉ để hiển thị. */
        device: text("device").notNull().default(""),
        revoked: boolean("revoked").notNull().default(false),
    },
    (table) => [index("user_sessions_user_id_idx").on(table.userId)]
);

export type UserSession = typeof UserSessions.$inferSelect;
export type NewUserSession = typeof UserSessions.$inferInsert;
