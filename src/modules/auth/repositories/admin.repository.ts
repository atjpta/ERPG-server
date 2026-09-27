import { eq } from "drizzle-orm";
import type { Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Admins } from "@/modules/auth/entities/admin.entity.js";

export class AdminRepository extends BaseRepository<typeof Admins> {
    constructor() {
        super(Admins);
    }

    async findByEmail(params: { email: string; dbOrTx?: Queryable }) {
        const { email, dbOrTx } = params;
        return this.findOne({ where: eq(Admins.email, email), dbOrTx });
    }
}

export const AdminRepo = new AdminRepository();
