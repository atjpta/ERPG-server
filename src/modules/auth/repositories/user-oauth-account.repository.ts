import { and, asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { UserOauthAccounts } from "@/modules/auth/entities/user-oauth-account.entity.js";
import { OauthProvider } from "@/modules/auth/enums/oauth-provider.enum.js";

export class UserOauthAccountRepository extends BaseRepository<typeof UserOauthAccounts> {
    constructor() {
        super(UserOauthAccounts);
    }

    async findByProviderAccount(params: {
        provider: OauthProvider;
        providerUserId: string;
        dbOrTx?: Queryable;
    }) {
        const { provider, providerUserId, dbOrTx } = params;
        return this.findOne({
            where: and(
                eq(UserOauthAccounts.provider, provider),
                eq(UserOauthAccounts.providerUserId, providerUserId)
            )!,
            dbOrTx,
        });
    }

    /** Các cách đăng nhập đã liên kết của user, cũ → mới. */
    async findByUserId(params: { userId: string; dbOrTx?: Queryable }) {
        const { userId, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(UserOauthAccounts)
            .where(eq(UserOauthAccounts.userId, userId))
            .orderBy(asc(UserOauthAccounts.createdAt));
    }

    async deleteByUserId(params: { userId: string; dbOrTx?: Queryable }) {
        const { userId, dbOrTx = db } = params;
        return dbOrTx
            .delete(UserOauthAccounts)
            .where(eq(UserOauthAccounts.userId, userId))
            .returning();
    }
}

export const UserOauthAccountRepo = new UserOauthAccountRepository();
