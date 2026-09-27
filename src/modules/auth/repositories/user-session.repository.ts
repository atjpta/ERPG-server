import { and, desc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { UserSessions } from "@/modules/auth/entities/user-session.entity.js";

export class UserSessionRepository extends BaseRepository<typeof UserSessions> {
    constructor() {
        super(UserSessions);
    }

    async revoke(params: { id: string; dbOrTx?: Queryable }) {
        return this.updateById({ id: params.id, data: { revoked: true }, dbOrTx: params.dbOrTx });
    }

    async revokeAllByUserId(params: { userId: string; dbOrTx?: Queryable }) {
        const { userId, dbOrTx = db } = params;
        return dbOrTx
            .update(UserSessions)
            .set({ revoked: true })
            .where(and(eq(UserSessions.userId, userId), eq(UserSessions.revoked, false)))
            .returning();
    }

    async findActiveByUserId(params: { userId: string; dbOrTx?: Queryable }) {
        const { userId, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(UserSessions)
            .where(and(eq(UserSessions.userId, userId), eq(UserSessions.revoked, false)))
            .orderBy(desc(UserSessions.createdAt));
    }
}

export const UserSessionRepo = new UserSessionRepository();
