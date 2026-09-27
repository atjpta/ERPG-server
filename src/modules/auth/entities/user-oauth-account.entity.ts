import { pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { OauthProvider } from "@/modules/auth/enums/oauth-provider.enum.js";
import { Users } from "@/modules/auth/entities/user.entity.js";

export const oauthProviderEnum = pgEnum("oauth_provider", OauthProvider);

export const UserOauthAccounts = pgTable(
    "user_oauth_accounts",
    {
        ...baseColumns(),
        userId: uuid("user_id")
            .notNull()
            .references(() => Users.id, { onDelete: "cascade" }),
        provider: oauthProviderEnum("provider").notNull(),
        providerUserId: text("provider_user_id").notNull(),
        email: text("email"),
    },
    (table) => [unique().on(table.provider, table.providerUserId)]
);

export type UserOauthAccount = typeof UserOauthAccounts.$inferSelect;
export type NewUserOauthAccount = typeof UserOauthAccounts.$inferInsert;
