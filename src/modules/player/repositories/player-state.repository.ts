import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { PlayerDatas, type NewPlayerData } from "@/modules/player/entities/player-data.entity.js";

export class PlayerStateRepository {
    async findByPlayerId(playerId: string, dbOrTx: Queryable = db) {
        const [state] = await dbOrTx
            .select()
            .from(PlayerDatas)
            .where(eq(PlayerDatas.playerId, playerId))
            .limit(1);
        return state ?? null;
    }

    async findByPlayerIds(playerIds: string[], dbOrTx: Queryable = db) {
        if (playerIds.length === 0) return [];
        return dbOrTx.select().from(PlayerDatas).where(inArray(PlayerDatas.playerId, playerIds));
    }

    /**
     * Gán `skills` cho mọi player của class này đang có bộ khác (không đổi revision — room không lưu
     * `skills`, player đang online nhận bộ mới ở lần vào room sau).
     */
    async replaceClassSkills(
        classId: string,
        skills: NonNullable<NewPlayerData["skills"]>,
        dbOrTx: Queryable = db
    ) {
        return dbOrTx
            .update(PlayerDatas)
            .set({ skills })
            .where(
                and(
                    eq(PlayerDatas.classId, classId),
                    sql`${PlayerDatas.skills} <> ${JSON.stringify(skills)}::jsonb`
                )
            )
            .returning({ playerId: PlayerDatas.playerId });
    }

    /** Gán class cho mọi player chưa có class (không đổi revision — không đụng state online). */
    async fillMissingClass(classId: string, dbOrTx: Queryable = db) {
        return dbOrTx
            .update(PlayerDatas)
            .set({ classId })
            .where(isNull(PlayerDatas.classId))
            .returning({ playerId: PlayerDatas.playerId });
    }

    async create(data: NewPlayerData, dbOrTx: Queryable = db) {
        const [state] = await dbOrTx.insert(PlayerDatas).values(data).returning();
        return state;
    }

    async updateByPlayerId(
        playerId: string,
        data: Partial<Omit<NewPlayerData, "playerId">>,
        dbOrTx: Queryable = db
    ) {
        const [state] = await dbOrTx
            .update(PlayerDatas)
            .set({ ...data, revision: sql`${PlayerDatas.revision} + 1` })
            .where(eq(PlayerDatas.playerId, playerId))
            .returning();
        return state ?? null;
    }

    async updateIfUnchanged(
        playerId: string,
        expectedRevision: number,
        data: Partial<Omit<NewPlayerData, "playerId">>,
        dbOrTx: Queryable = db
    ) {
        const [state] = await dbOrTx
            .update(PlayerDatas)
            .set({ ...data, revision: sql`${PlayerDatas.revision} + 1` })
            .where(
                and(eq(PlayerDatas.playerId, playerId), eq(PlayerDatas.revision, expectedRevision))
            )
            .returning();
        return state ?? null;
    }
}

export const PlayerStateRepo = new PlayerStateRepository();
