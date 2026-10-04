import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import {
    PlayerStates,
    type NewPlayerState,
} from "@/modules/player/entities/player-state.entity.js";

export class PlayerStateRepository {
    async findByPlayerId(playerId: string, dbOrTx: Queryable = db) {
        const [state] = await dbOrTx
            .select()
            .from(PlayerStates)
            .where(eq(PlayerStates.playerId, playerId))
            .limit(1);
        return state ?? null;
    }

    async findByPlayerIds(playerIds: string[], dbOrTx: Queryable = db) {
        if (playerIds.length === 0) return [];
        return dbOrTx.select().from(PlayerStates).where(inArray(PlayerStates.playerId, playerIds));
    }

    /** Gán `skills` cho player của class này chưa có skill nào (không đổi revision — không đụng state online). */
    async fillEmptySkills(
        classId: string,
        skills: NewPlayerState["skills"],
        dbOrTx: Queryable = db
    ) {
        return dbOrTx
            .update(PlayerStates)
            .set({ skills })
            .where(
                and(eq(PlayerStates.classId, classId), sql`${PlayerStates.skills} = '[]'::jsonb`)
            )
            .returning({ playerId: PlayerStates.playerId });
    }

    /** Gán class cho mọi player chưa có class (không đổi revision — không đụng state online). */
    async fillMissingClass(classId: string, dbOrTx: Queryable = db) {
        return dbOrTx
            .update(PlayerStates)
            .set({ classId })
            .where(isNull(PlayerStates.classId))
            .returning({ playerId: PlayerStates.playerId });
    }

    async create(data: NewPlayerState, dbOrTx: Queryable = db) {
        const [state] = await dbOrTx.insert(PlayerStates).values(data).returning();
        return state;
    }

    async updateByPlayerId(
        playerId: string,
        data: Partial<Omit<NewPlayerState, "playerId">>,
        dbOrTx: Queryable = db
    ) {
        const [state] = await dbOrTx
            .update(PlayerStates)
            .set({ ...data, revision: sql`${PlayerStates.revision} + 1` })
            .where(eq(PlayerStates.playerId, playerId))
            .returning();
        return state ?? null;
    }

    async updateIfUnchanged(
        playerId: string,
        expectedRevision: number,
        data: Partial<Omit<NewPlayerState, "playerId">>,
        dbOrTx: Queryable = db
    ) {
        const [state] = await dbOrTx
            .update(PlayerStates)
            .set({ ...data, revision: sql`${PlayerStates.revision} + 1` })
            .where(
                and(
                    eq(PlayerStates.playerId, playerId),
                    eq(PlayerStates.revision, expectedRevision)
                )
            )
            .returning();
        return state ?? null;
    }
}

export const PlayerStateRepo = new PlayerStateRepository();
