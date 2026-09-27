import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { BaseRepository } from "@/core/repositories/base.repository.js";

type BaseTable = PgTable & { id: PgColumn; createdAt: PgColumn };
type Repo<TTable extends BaseTable> = BaseRepository<TTable>;

/**
 * Service gốc — mỗi hàm tương ứng 1-1 với `BaseRepository` (cùng tên, cùng object param),
 * chỉ uỷ quyền xuống repo. Service con kế thừa để có sẵn CRUD, logic riêng viết thêm method.
 */
export abstract class BaseService<TTable extends BaseTable> {
    constructor(protected readonly repo: Repo<TTable>) {}

    findById(params: Parameters<Repo<TTable>["findById"]>[0]) {
        return this.repo.findById(params);
    }

    findOne(params: Parameters<Repo<TTable>["findOne"]>[0]) {
        return this.repo.findOne(params);
    }

    findByIdOrFail(params: Parameters<Repo<TTable>["findByIdOrFail"]>[0]) {
        return this.repo.findByIdOrFail(params);
    }

    findOneOrFail(params: Parameters<Repo<TTable>["findOneOrFail"]>[0]) {
        return this.repo.findOneOrFail(params);
    }

    findMany(params: Parameters<Repo<TTable>["findMany"]>[0] = {}) {
        return this.repo.findMany(params);
    }

    count(params: Parameters<Repo<TTable>["count"]>[0] = {}) {
        return this.repo.count(params);
    }

    create(params: Parameters<Repo<TTable>["create"]>[0]) {
        return this.repo.create(params);
    }

    updateById(params: Parameters<Repo<TTable>["updateById"]>[0]) {
        return this.repo.updateById(params);
    }

    updateByIdOrFail(params: Parameters<Repo<TTable>["updateByIdOrFail"]>[0]) {
        return this.repo.updateByIdOrFail(params);
    }

    deleteById(params: Parameters<Repo<TTable>["deleteById"]>[0]) {
        return this.repo.deleteById(params);
    }

    deleteByIdOrFail(params: Parameters<Repo<TTable>["deleteByIdOrFail"]>[0]) {
        return this.repo.deleteByIdOrFail(params);
    }

    upsert(params: Parameters<Repo<TTable>["upsert"]>[0]) {
        return this.repo.upsert(params);
    }

    paginate<TSelection = TTable["$inferSelect"]>(params: Parameters<Repo<TTable>["paginate"]>[0]) {
        return this.repo.paginate<TSelection>(params);
    }
}
