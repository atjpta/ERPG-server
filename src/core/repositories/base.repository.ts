import { count, desc, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgSelect, PgTable, SelectedFields } from "drizzle-orm/pg-core";
import { db, type Queryable } from "@/configs/postgres.config.js";
import type { PaginationQuery } from "@/core/validators/pagination.validator.js";
import { serviceError } from "@/core/utils/service-error.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";

type BaseTable = PgTable & { id: PgColumn; createdAt: PgColumn };

export function withTransaction<T>(
    fn: (tx: Queryable) => Promise<T>,
    dbOrTx?: Queryable
): Promise<T> {
    return dbOrTx ? fn(dbOrTx) : db.transaction(fn);
}

export abstract class BaseRepository<TTable extends BaseTable> {
    constructor(protected readonly table: TTable) {}

    private get t(): PgTable {
        return this.table as unknown as PgTable;
    }

    async findById(params: {
        id: string;
        dbOrTx?: Queryable;
    }): Promise<TTable["$inferSelect"] | null> {
        const { id, dbOrTx = db } = params;
        const [row] = await dbOrTx.select().from(this.t).where(eq(this.table.id, id)).limit(1);
        return (row as TTable["$inferSelect"]) ?? null;
    }

    async findOne(params: {
        where: SQL;
        dbOrTx?: Queryable;
    }): Promise<TTable["$inferSelect"] | null> {
        const { where, dbOrTx = db } = params;
        const [row] = await dbOrTx.select().from(this.t).where(where).limit(1);
        return (row as TTable["$inferSelect"]) ?? null;
    }

    async findByIdOrFail(params: {
        id: string;
        dbOrTx?: Queryable;
        message?: string;
        code?: ResponseCode;
    }): Promise<TTable["$inferSelect"]> {
        const { id, dbOrTx, message = "Not found", code = ResponseCode.NOT_FOUND } = params;
        const row = await this.findById({ id, dbOrTx });
        if (!row) serviceError(message, 404, code);
        return row;
    }

    async findOneOrFail(params: {
        where: SQL;
        dbOrTx?: Queryable;
        message?: string;
        code?: ResponseCode;
    }): Promise<TTable["$inferSelect"]> {
        const { where, dbOrTx, message = "Not found", code = ResponseCode.NOT_FOUND } = params;
        const row = await this.findOne({ where, dbOrTx });
        if (!row) serviceError(message, 404, code);
        return row;
    }

    async findMany(
        params: {
            where?: SQL;
            dbOrTx?: Queryable;
        } = {}
    ): Promise<TTable["$inferSelect"][]> {
        const { where, dbOrTx = db } = params;
        return (await dbOrTx.select().from(this.t).where(where)) as TTable["$inferSelect"][];
    }

    async count(params: { where?: SQL; dbOrTx?: Queryable } = {}): Promise<number> {
        const { where, dbOrTx = db } = params;
        const [{ total }] = await dbOrTx.select({ total: count() }).from(this.t).where(where);
        return total;
    }

    async create(params: {
        data: TTable["$inferInsert"];
        dbOrTx?: Queryable;
    }): Promise<TTable["$inferSelect"]> {
        const { data, dbOrTx = db } = params;
        const [row] = await dbOrTx.insert(this.t).values(data).returning();
        return row as TTable["$inferSelect"];
    }

    async updateById(params: {
        id: string;
        data: Partial<TTable["$inferInsert"]>;
        dbOrTx?: Queryable;
    }): Promise<TTable["$inferSelect"] | null> {
        const { id, data, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .update(this.t)
            .set(data)
            .where(eq(this.table.id, id))
            .returning();
        return (row as TTable["$inferSelect"]) ?? null;
    }

    async updateByIdOrFail(params: {
        id: string;
        data: Partial<TTable["$inferInsert"]>;
        dbOrTx?: Queryable;
        message?: string;
        code?: ResponseCode;
    }): Promise<TTable["$inferSelect"]> {
        const { id, data, dbOrTx, message = "Not found", code = ResponseCode.NOT_FOUND } = params;
        const row = await this.updateById({ id, data, dbOrTx });
        if (!row) serviceError(message, 404, code);
        return row;
    }

    async deleteById(params: {
        id: string;
        dbOrTx?: Queryable;
    }): Promise<TTable["$inferSelect"] | null> {
        const { id, dbOrTx = db } = params;
        const [row] = await dbOrTx.delete(this.t).where(eq(this.table.id, id)).returning();
        return (row as TTable["$inferSelect"]) ?? null;
    }

    async deleteByIdOrFail(params: {
        id: string;
        dbOrTx?: Queryable;
        message?: string;
        code?: ResponseCode;
    }): Promise<TTable["$inferSelect"]> {
        const { id, dbOrTx, message = "Not found", code = ResponseCode.NOT_FOUND } = params;
        const row = await this.deleteById({ id, dbOrTx });
        if (!row) serviceError(message, 404, code);
        return row;
    }

    async upsert(params: {
        data: TTable["$inferInsert"];
        target: PgColumn;
        matchValue: string;
        updateData?: Partial<TTable["$inferInsert"]>;
        dbOrTx?: Queryable;
    }): Promise<TTable["$inferSelect"]> {
        const { data, target, matchValue, updateData, dbOrTx = db } = params;
        const insert = dbOrTx.insert(this.t).values(data);
        const [row] = updateData
            ? await insert.onConflictDoUpdate({ target, set: updateData }).returning()
            : await insert.onConflictDoNothing({ target }).returning();
        if (row) return row as TTable["$inferSelect"];

        const existing = await this.findOne({ where: eq(target, matchValue), dbOrTx });
        return existing as TTable["$inferSelect"];
    }

    async paginate<TSelection = TTable["$inferSelect"]>(params: {
        pagination: Pick<PaginationQuery, "page" | "limit">;
        where?: SQL;
        select?: SelectedFields;
        join?: (query: PgSelect) => PgSelect;
        /** Chỉ cần truyền khi `where`/`join` lọc theo cột của bảng join — nếu không, count không cần join. */
        countJoin?: (query: PgSelect) => PgSelect;
        orderBy?: SQL;
        dbOrTx?: Queryable;
    }): Promise<{
        items: TSelection[];
        pagination: { total: number; page: number; limit: number };
    }> {
        const { pagination, where, select, join, countJoin, orderBy, dbOrTx = db } = params;
        const { page, limit } = pagination;
        const applyJoin = (query: PgSelect) => (join ? join(query) : query);
        const applyCountJoin = (query: PgSelect) => (countJoin ? countJoin(query) : query);

        const [items, [{ total }]] = await Promise.all([
            applyJoin((select ? dbOrTx.select(select) : dbOrTx.select()).from(this.t).$dynamic())
                .where(where)
                .orderBy(orderBy ?? desc(this.table.createdAt))
                .limit(limit)
                .offset((page - 1) * limit),
            applyCountJoin(dbOrTx.select({ total: count() }).from(this.t).$dynamic()).where(where),
        ]);

        return { items: items as TSelection[], pagination: { total, page, limit } };
    }
}
