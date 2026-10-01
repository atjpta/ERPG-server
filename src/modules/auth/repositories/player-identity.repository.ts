import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Players } from "@/modules/auth/entities/player.entity.js";

export class PlayerIdentityRepository extends BaseRepository<typeof Players> {
    constructor() {
        super(Players);
    }

    async findByUserId(params: { userId: string; dbOrTx?: Queryable }) {
        const { userId, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(Players)
            .where(eq(Players.userId, userId))
            .orderBy(asc(Players.createdAt));
    }

    async deleteByUserId(params: { userId: string; dbOrTx?: Queryable }) {
        const { userId, dbOrTx = db } = params;
        return dbOrTx.delete(Players).where(eq(Players.userId, userId)).returning();
    }

    async findByIds(ids: string[], dbOrTx: Queryable = db) {
        if (ids.length === 0) return [];
        return dbOrTx.select().from(Players).where(inArray(Players.id, ids));
    }

    async findByServerAndName(params: {
        serverId: string;
        name: string;
        excludeId?: string;
        dbOrTx?: Queryable;
    }) {
        const { serverId, name, excludeId, dbOrTx } = params;
        return this.findOne({
            where: and(
                eq(Players.serverId, serverId),
                eq(sql`lower(${Players.name})`, name.toLowerCase()),
                excludeId ? ne(Players.id, excludeId) : undefined
            )!,
            dbOrTx,
        });
    }
}

export const PlayerIdentityRepo = new PlayerIdentityRepository();
